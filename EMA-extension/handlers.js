// handlers.js
import { authenticateUser, forceReauthenticate } from './auth.js';
import { fetchEmails, fetchEmailContent } from './gmailApi.js';
import { summarizeEmails, extractCalendarEvents, processEmailQuery } from './geminiApi.js';
import { fetchCalendarEvents, addEventToCalendar, syncCalendarEvents, verifyEventInCalendar } from './calendar.js';
import { initSummaryDB, storeEmails, getSummaryFromCache, storeSummaryInCache, getEventsFromCache, storeEventsInCache, cleanupOldCacheEntries, getCachedItem, storeCachedItem } from './storage.js';
import {standardizeDate, convertTimeToISO, getEndTime, generateEmailContentHash, createBasicEventsFromEmails}  from './utils.js';

export function registerHandlers() {
    console.log("📅 Handlers: Registering message handlers");
    
    // Trigger authentication and processing on extension installation or startup
    chrome.runtime.onInstalled.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    
    chrome.runtime.onStartup.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    

    // Main message listener
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log("📅 Handlers: Received message", request.action);
        
        // Pass through status updates to the popup
        if (request.action === "updateSummaryStatus") {
            // Forward the message to all open extension pages
            chrome.runtime.sendMessage(request);
            return true;
        }
        
        if (request.action === "getEmails") {
            const timeFilter = request.timeFilter || 'week';
            const readFilter = request.readFilter || 'all';
            
            // Authenticate and fetch emails with the filters
            authenticateUser(async function(token) {
                try {
                    const messages = await fetchEmails(token, timeFilter, readFilter);
                    
                    // Fetch full content for each message ID
                    let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
                    const fullEmails = await Promise.all(emailPromises);
                    
                    // Filter out any failed fetches
                    const validEmails = fullEmails.filter(email => email !== null);
                    
                    // Store emails in IndexedDB
                    await storeEmails(validEmails);
                    
                    // Store the full emails in Chrome Storage
                    chrome.storage.local.set({ emails: validEmails }, () => {
                        console.log("Emails stored in Chrome Storage.");
                    });
                    
                    // Extract calendar events
                    const events = await extractCalendarEvents(validEmails);
                    
                    // Send the emails and events back to the popup
                    sendResponse({
                        emails: validEmails || [],
                        events: events || []
                    });
                } catch (error) {
                    console.error("❌ Error processing emails:", error);
                    sendResponse({
                        error: "Failed to fetch emails. Please try again.",
                        emails: [],
                        events: []
                    });
                }
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "summarizeEmails") {
            // Get emails from the request
            const emails = request.emails || [];
            
            // Get filter values if provided
            const timeFilter = request.timeFilter || null;
            const readFilter = request.readFilter || null;
            
            // Check if we should force regeneration
            const forceRegenerate = request.forceRegenerate || false;
            
            // Generate summary using Gemini API (with caching logic)
            summarizeEmails(emails, { 
                timeFilter: timeFilter,
                readFilter: readFilter,
                forceRegenerate: forceRegenerate 
            }).then(summary => {
                sendResponse({summary: summary});
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "extractEvents") {
            // Get emails from the request or from storage
            const forceRefresh = request.forceRefresh || false;
            console.log("📅 Handler received extractEvents request, forceRefresh:", forceRefresh);
            
            if (request.emails && request.emails.length > 0) {
                console.log(`📅 Using ${request.emails.length} emails provided in request`);
                extractCalendarEvents(request.emails, { forceRefresh }).then(events => {
                    console.log(`📅 Extracted ${events.length} events, sending response`);
                    sendResponse({events: events});
                }).catch(error => {
                    console.error("Error extracting events:", error);
                    sendResponse({events: [], error: "Failed to extract events"});
                });
            } else {
                console.log("📅 No emails in request, getting from storage");
                chrome.storage.local.get(['emails'], function(result) {
                    const emails = result.emails || [];
                    console.log(`📅 Retrieved ${emails.length} emails from storage`);
                    
                    if (emails.length === 0) {
                        console.log("📅 No emails found in storage, returning empty array");
                        sendResponse({events: []});
                        return;
                    }
                    
                    extractCalendarEvents(emails, { forceRefresh }).then(events => {
                        console.log(`📅 Extracted ${events.length} events from storage emails, sending response`);
                        sendResponse({events: events});
                    }).catch(error => {
                        console.error("Error extracting events:", error);
                        sendResponse({events: [], error: "Failed to extract events"});
                    });
                });
            }
            return true; // Required for async response
        }
        
        if (request.action === "syncCalendarEvents") {
            // Authenticate and sync calendar events
            authenticateUser(async function(token) {
                try {
                    // Perform calendar sync
                    const result = await syncCalendarEvents(token);
                    
                    // Reload events after sync
                    chrome.storage.local.get(['emails'], async function(result) {
                        const emails = result.emails || [];
                        const updatedEvents = await getEventsFromCache();
                        
                        sendResponse({
                            success: true,
                            syncedCount: result.synced,
                            events: updatedEvents
                        });
                    });
                } catch (error) {
                    console.error("❌ Error syncing calendar events:", error);
                    sendResponse({
                        success: false,
                        error: "Failed to sync with Google Calendar."
                    });
                }
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "addToCalendar") {
            // Get the event data from the request
            const eventData = request.event;
            
            if (!eventData) {
                sendResponse({success: false, error: "No event data provided"});
                return true;
            }
            
            // Authenticate and add event to calendar
            authenticateUser(async function(token) {
                try {
                    const result = await addEventToCalendar(token, eventData);
                    sendResponse({
                        success: true,
                        eventId: result.id,
                        exists: result.exists || false
                    });
                } catch (error) {
                    console.error("❌ Error adding event to calendar:", error);
                    
                    // If it's a permission error, try to get a new token with the right scopes
                    if (error.message && error.message.includes('Calendar permission denied')) {
                        console.log("🔄 Need to re-authenticate with calendar scopes");
                        
                        // Use the force re-authentication function
                        forceReauthenticate(async (newToken) => {
                            if (!newToken) {
                                sendResponse({
                                    success: false,
                                    error: "Could not authenticate with calendar. Please reload the extension and try again."
                                });
                                return;
                            }
                            
                            // Try again with the new token
                            try {
                                const result = await addEventToCalendar(newToken, eventData);
                                sendResponse({
                                    success: true,
                                    eventId: result.id,
                                    exists: result.exists || false
                                });
                            } catch (retryError) {
                                sendResponse({
                                    success: false,
                                    error: "Calendar access failed even after re-authentication. Please try again later."
                                });
                            }
                        });
                    } else {
                        sendResponse({
                            success: false,
                            error: error.message || "Unknown error adding event to calendar"
                        });
                    }
                }
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "processMessage") {
            (async () => {
                const userMessage = request.message.toLowerCase();
                
                // First check if we have emails in storage
                chrome.storage.local.get(['emails'], async function(result) {
                    const emails = result.emails || [];
                    
                    // If asking about emails
                    if (emails.length === 0) {
                        // No emails in storage, fetch them first
                        authenticateUser(async function(token) {
                            try {
                                const messages = await fetchEmails(token, '10');
                                let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
                                const fullEmails = await Promise.all(emailPromises);
                                const validEmails = fullEmails.filter(email => email !== null);
                                
                                if (validEmails.length > 0) {
                                    // Store the emails
                                    await storeEmails(validEmails);
                                    chrome.storage.local.set({ emails: validEmails });
                                    
                                    // Process the user's query with the emails
                                    const answer = await processEmailQuery(request.message, validEmails);
                                    sendResponse({
                                        reply: answer
                                    });
                                } else {
                                    sendResponse({
                                        reply: "I couldn't find any recent emails in your inbox. Would you like me to try again?"
                                    });
                                }
                            } catch (error) {
                                console.error("Error fetching emails:", error);
                                sendResponse({
                                    reply: "I had trouble accessing your emails. Let me try again in a moment."
                                });
                            }
                        });
                    } else {
                        // We have emails, process the query dynamically
                        const answer = await processEmailQuery(request.message, emails);
                        sendResponse({
                            reply: answer
                        });
                    }
                });
                
                return true; // Required for async response
            })();
            
            return true; // Required for async response
        }
    });
     
    console.log("📅 Handlers: Message handlers registered successfully");
}

// Main function to fetch emails, process their content, and summarize them
async function processEmailsAndSummarize(token) {
    try {
      // Run cache cleanup occasionally
      await cleanupOldCacheEntries();
      
      // Use default values - past week, all emails
      const messages = await fetchEmails(token);
      
      // Fetch full content for each message ID
      let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
     
      const fullEmails = await Promise.all(emailPromises);
      const validEmails = fullEmails.filter(email => email !== null);
  
      // Filter out any failed fetches
      const contactsMap = new Map();
  
      validEmails.forEach(email => {
        const fromHeader = email.from || "";
        const toHeader = email.to || "";
      
        [fromHeader, toHeader].forEach(raw => {
          if (!raw) return;
          raw.split(',').forEach(entry => {
            const match = entry.match(/(.*)<(.*)>/);  // "Name <email>"
            if (match) {
              const name = match[1].trim();
              const emailAddr = match[2].trim();
              contactsMap.set(name, emailAddr);
            } else if (entry.includes('@')) {
              const emailOnly = entry.trim();
              contactsMap.set(emailOnly.split('@')[0], emailOnly);
            }
          });
        });
      });
      
      const knownContacts = Array.from(contactsMap.entries()); // <-- array of [name, email]
      chrome.storage.local.set({ knownContacts });
      
      console.log("👥 Contacts found in inbox:", knownContacts);
  
  
      
      // Store emails in IndexedDB
      await storeEmails(validEmails);
      
      // Also store in Chrome Storage for backward compatibility
      chrome.storage.local.set({ emails: validEmails }, () => {
        console.log("Emails stored in Chrome Storage.");
      });
      
      // Generate summary
      const summary = await summarizeEmails(validEmails);
      
      if (summary) {
        // Store the summary in Chrome Storage for use in your extension's UI
        chrome.storage.local.set({ summary: summary }, () => {
          console.log("Summary stored in Chrome Storage.");
        });
      }
      
      // Extract calendar events
      const events = await extractCalendarEvents(validEmails);
      
      return {
        summary: summary,
        events: events
      };
    } catch (error) {
      console.error("❌ Error in processEmailsAndSummarize:", error);
      return {
        summary: "Unable to generate summary.",
        events: []
      };
    }
}
  
async function sendEmail(token, to, subject, message) {
    const email = 
        `To: ${to}\r\n` +
        `Subject: ${subject}\r\n` +
        `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
        `${message}`;

    const encodedMessage = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-').replace(/\//g, '_');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedMessage })
    });

    const data = await res.json();
    return data;
}

