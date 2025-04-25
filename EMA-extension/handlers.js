// handlers.js
import { authenticateUser, forceReauthenticate } from './auth.js';
import { fetchEmails, fetchEmailContent } from './gmailApi.js';
import { summarizeEmails, extractCalendarEvents, processEmailQuery } from './geminiApi.js';
import { fetchCalendarEvents, addEventToCalendar, syncCalendarEvents, verifyEventInCalendar, removeEventFromCalendar } from './calendar.js';
import { initSummaryDB, storeEmails, getSummaryFromDB, storeSummaryInDB, getEventsFromDB, storeEventsInCache, cleanupOldCacheEntries, getCachedItem, storeCachedItem, storeContactsInDB, getContactsFromDB } from './storage.js';
import {standardizeDate, convertTimeToISO, getEndTime, generateEmailContentHash, createBasicEventsFromEmails}  from './utils.js';
import { processAgentRequest, fetchAndStoreEmails, sendEmail as agentSendEmail } from './agent.js';

import { interpretUserMessage } from './geminiApi.js';

import { fetchAndStoreContacts, fetchContacts } from './contactsApi.js';

// Object to track active requests
const activeRequests = {};


export function registerHandlers() {
    console.log("📅 Handlers: Registering message handlers");
    
    // Initialize the summary database
    initSummaryDB().then(() => {
        console.log("✅ Summary database initialized");
    }).catch(err => {
        console.error("❌ Error initializing summary database:", err);
    });
    
    // Trigger authentication and processing on extension installation or startup
    chrome.runtime.onInstalled.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    
    chrome.runtime.onStartup.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    

    // Main message listener
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        console.log("📅 Handlers: Received message: ", request.action);
        
        // Cancel request handler
        if (request.action === "cancelRequest") {
            const requestId = request.requestId;
            if (requestId && activeRequests[requestId]) {
                console.log(`Cancelling request with ID: ${requestId}`);
                // Mark the request as cancelled
                activeRequests[requestId].cancelled = true;
                // Clean up the entry
                delete activeRequests[requestId];
                sendResponse({success: true});
            } else {
                console.log(`Request ID not found or already cancelled: ${requestId}`);
                sendResponse({success: false, error: "Request not found"});
            }
            return true;
        }
        
        // Pass through status updates to the popup
        if (request.action === "updateSummaryStatus") {
            // Forward the message to all open extension pages
            chrome.runtime.sendMessage(request);
            return true;
        }
        
        if (request.action === "getEmails") {
            const timeFilter = request.timeFilter || 'week';
            const readFilter = request.readFilter || 'all';
            const additionalFilters = request.additionalFilters || {
                inboxOnly: true,
                excludeOther: false,
                excludePromotions: false,
                excludeSocial: false
            };
            
            // Register the request if it has an ID
            if (request.requestId) {
                activeRequests[request.requestId] = { 
                    action: "getEmails",
                    timestamp: Date.now(),
                    cancelled: false
                };
            }
            
            // Authenticate and fetch emails with the filters
            authenticateUser(async function(token) {
                try {
                    // Check if request was cancelled
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    const messages = await fetchEmails(token, timeFilter, readFilter, additionalFilters);
                    
                    // Check if request was cancelled
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    // Fetch full content for each message ID
                    let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
                    const fullEmails = await Promise.all(emailPromises);
                    
                    // Check if request was cancelled
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
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
                    
                    // Check if request was cancelled before sending response
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    // Clean up the tracking entry
                    if (request.requestId) {
                        delete activeRequests[request.requestId];
                    }
                    
                    // Send the emails and events back to the popup
                    sendResponse({
                        emails: validEmails || [],
                        events: events || []
                    });
                } catch (error) {
                    console.error("❌ Error processing emails:", error);
                    
                    // Clean up the tracking entry
                    if (request.requestId) {
                        delete activeRequests[request.requestId];
                    }
                    
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
            
            // Register the request if it has an ID
            if (request.requestId) {
                activeRequests[request.requestId] = { 
                    action: "summarizeEmails",
                    timestamp: Date.now(),
                    cancelled: false
                };
            }
            
            // Generate summary using Gemini API (with caching logic)
            summarizeEmails(emails, { 
                timeFilter: timeFilter,
                readFilter: readFilter,
                forceRegenerate: forceRegenerate 
            }).then(summary => {
                // Check if request was cancelled before sending response
                if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                    console.log(`Request ${request.requestId} was cancelled, aborting`);
                    delete activeRequests[request.requestId];
                    return;
                }
                
                // Clean up the tracking entry
                if (request.requestId) {
                    delete activeRequests[request.requestId];
                }
                
                sendResponse({summary: summary});
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "extractEvents") {
            // Get emails from the request or from storage
            const forceRefresh = request.forceRefresh || false;
            console.log("📅 Handler received extractEvents request, forceRefresh:", forceRefresh);
            
            // Register the request if it has an ID
            if (request.requestId) {
                activeRequests[request.requestId] = { 
                    action: "extractEvents",
                    timestamp: Date.now(),
                    cancelled: false
                };
            }
            
            if (request.emails && request.emails.length > 0) {
                console.log(`📅 Using ${request.emails.length} emails provided in request`);
                extractCalendarEvents(request.emails, { forceRefresh }).then(events => {
                    // Check if request was cancelled before sending response
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    console.log(`📅 Extracted ${events.length} events, sending response`);
                    
                    // Clean up the tracking entry
                    if (request.requestId) {
                        delete activeRequests[request.requestId];
                    }
                    
                    sendResponse({events: events});
                }).catch(error => {
                    console.error("Error extracting events:", error);
                    
                    // Clean up the tracking entry
                    if (request.requestId) {
                        delete activeRequests[request.requestId];
                    }
                    
                    sendResponse({events: [], error: "Failed to extract events"});
                });
            } else {
                console.log("📅 No emails in request, getting from storage");
                chrome.storage.local.get(['emails'], function(result) {
                    const emails = result.emails || [];
                    console.log(`📅 Retrieved ${emails.length} emails from storage`);
                    
                    if (emails.length === 0) {
                        console.log("📅 No emails found in storage, returning empty array");
                        
                        // Clean up the tracking entry
                        if (request.requestId) {
                            delete activeRequests[request.requestId];
                        }
                        
                        sendResponse({events: []});
                        return;
                    }
                    
                    extractCalendarEvents(emails, { forceRefresh }).then(events => {
                        // Check if request was cancelled before sending response
                        if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                            console.log(`Request ${request.requestId} was cancelled, aborting`);
                            delete activeRequests[request.requestId];
                            return;
                        }
                        
                        console.log(`📅 Extracted ${events.length} events from storage emails, sending response`);
                        
                        // Clean up the tracking entry
                        if (request.requestId) {
                            delete activeRequests[request.requestId];
                        }
                        
                        sendResponse({events: events});
                    }).catch(error => {
                        console.error("Error extracting events:", error);
                        
                        // Clean up the tracking entry
                        if (request.requestId) {
                            delete activeRequests[request.requestId];
                        }
                        
                        sendResponse({events: [], error: "Failed to extract events"});
                    });
                });
            }
            return true; // Required for async response
        }
        
        if (request.action === "syncCalendarEvents") {
            // Register the request if it has an ID
            if (request.requestId) {
                activeRequests[request.requestId] = { 
                    action: "syncCalendarEvents",
                    timestamp: Date.now(),
                    cancelled: false
                };
            }
            
            // Authenticate and sync calendar events
            authenticateUser(async function(token) {
                try {
                    // Check if request was cancelled
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    // Perform calendar sync
                    const result = await syncCalendarEvents(token);
                    
                    // Check if request was cancelled
                    if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                        console.log(`Request ${request.requestId} was cancelled, aborting`);
                        delete activeRequests[request.requestId];
                        return;
                    }
                    
                    // Reload events after sync
                    chrome.storage.local.get(['emails'], async function(result) {
                        const emails = result.emails || [];
                        const updatedEvents = await getEventsFromDB();
                        
                        // Check if request was cancelled before sending response
                        if (request.requestId && activeRequests[request.requestId]?.cancelled) {
                            console.log(`Request ${request.requestId} was cancelled, aborting`);
                            delete activeRequests[request.requestId];
                            return;
                        }
                        
                        // Clean up the tracking entry
                        if (request.requestId) {
                            delete activeRequests[request.requestId];
                        }
                        
                        sendResponse({
                            success: true,
                            syncedCount: result.synced,
                            events: updatedEvents
                        });
                    });
                } catch (error) {
                    console.error("❌ Error syncing calendar events: ", error);
                    
                    // Clean up the tracking entry
                    if (request.requestId) {
                        delete activeRequests[request.requestId];
                    }
                    
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
        
        if (request.action === "removeFromCalendar") {
            // Get the event data from the request
            const eventData = request.event;
            
            if (!eventData) {
                sendResponse({success: false, error: "No event data provided"});
                return true;
            }
            
            // Authenticate and remove event from calendar
            authenticateUser(async function(token) {
                try {
                    const result = await removeEventFromCalendar(token, eventData);
                    sendResponse({
                        success: true
                    });
                } catch (error) {
                    console.error("❌ Error removing event from calendar:", error);
                    
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
                                const result = await removeEventFromCalendar(newToken, eventData);
                                sendResponse({
                                    success: true
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
                            error: error.message || "Unknown error removing event from calendar"
                        });
                    }
                }
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "fetchContacts") {
            if (activeRequests["fetchContacts"]) {
                sendResponse({ status: "busy", message: "Already fetching contacts" });
                return true;
            }
            
            activeRequests["fetchContacts"] = true;
            
            authenticateUser(async function(token) {
                try {
                    const result = await fetchAndStoreContacts(token);
                    sendResponse({ 
                        status: "success", 
                        contacts: result.contacts, 
                        count: result.count 
                    });
                } catch (error) {
                    console.error("❌ Error fetching contacts:", error);
                    sendResponse({ 
                        status: "error", 
                        message: error.toString() 
                    });
                } finally {
                    delete activeRequests["fetchContacts"];
                }
            });
            
            return true;
        }
        
        if (request.action === "processMessage") {
            (async () => {
                try {
                    // Get context data from storage
                    const context = await new Promise(resolve => {
                        chrome.storage.local.get(['pendingEmail', 'emails', 'userContext'], async result => {
                            // Get contacts from IndexedDB instead of local storage
                            const knownContacts = await getContactsFromDB();
                            
                            // Add contacts to the context
                            resolve({
                                ...result,
                                knownContacts
                            });
                        });
                    });
                    
                    const userMessage = request.message.toLowerCase();
                    // 🧠 Step 1: Interpret calendar intent with Gemini
const interpreted = await interpretUserMessage(request.message);
console.log("🧠 Calendar interpretation:", JSON.stringify(interpreted, null, 2));

if (interpreted?.intent === "create_event" && interpreted?.eventDetails) {
    console.log("📅 Detected event intent:", interpreted.eventDetails);
  
    const { title, date, time, location } = interpreted.eventDetails;
  
    // Validate
    if (!title || !date || !time) {
      console.warn("❌ Missing required fields:", interpreted.eventDetails);
      sendResponse({
        reply: "❌ I couldn’t add your event because something is missing (title, date, or time).",
        success: false
      });
      return;
    }
  
    const event = {
      title,
      date,
      time,
      location: location || "",
      description: interpreted.eventDetails.description || ""
    };
  
    console.log("📤 Sending to addEventToCalendar:", event);
  
    authenticateUser(async (token) => {
      try {
        const result = await addEventToCalendar(token, event);
  
        sendResponse({
          reply: interpreted.reply || `✅ Added "${title}" to your calendar.`,
          success: true
        });
      } catch (err) {
        console.error("❌ Failed to create event:", err);
        sendResponse({
          reply: "❌ I understood your request but couldn’t add it to your calendar.",
          success: false
        });
      }
    });
  
    return; // Ensure async sendResponse works
  }
  

                    
                    // Handle simple yes/no for pending emails (legacy support)
                    if (userMessage === "yes" && context.pendingEmail) {
                        const { to, subject, body } = context.pendingEmail;
                        
                        if (!to || !subject || !body) {
                            sendResponse({ reply: "⚠️ Sorry, I don't have a complete email to send. Try again with more context." });
                            return;
                        }
                        
                        authenticateUser(async (token) => {
                            try {
                                // Use the sendEmail function from agent.js
                                await agentSendEmail(token, to, subject, body);
                                chrome.storage.local.remove('pendingEmail');
                                sendResponse({ reply: `✅ Email sent to ${to}. What else can I help you with?` });
                            } catch (err) {
                                sendResponse({ reply: "❌ Failed to send the email. Please try again." });
                            }
                        });
                        
                        return;
                    }
                    
                    if (userMessage === "no" && context.pendingEmail) {
                        chrome.storage.local.remove('pendingEmail');
                        sendResponse({ reply: "🛑 No problem. What else can I help you with?" });
                        return;
                    }
                    
                    // Ensure we have contacts loaded if needed
                    if (context.knownContacts === undefined || 
                        context.knownContacts.length === 0 || 
                        userMessage.includes("contact") || 
                        userMessage.includes("email") || 
                        userMessage.includes("send") || 
                        userMessage.includes("write")) {
                        
                        // Check when we last fetched contacts - fetch if older than 1 day or never fetched
                        const lastContactsFetch = context.lastContactsFetch || 0;
                        const oneDayInMs = 24 * 60 * 60 * 1000;
                        const shouldFetchContacts = Date.now() - lastContactsFetch > oneDayInMs;
                        
                        if (shouldFetchContacts) {
                            await new Promise(resolve => {
                                authenticateUser(async (token) => {
                                    try {
                                        const contactResult = await fetchAndStoreContacts(token);
                                        // Use the contacts from the result directly
                                        context.knownContacts = contactResult.contacts;
                                        resolve();
                                    } catch (error) {
                                        console.error("Error fetching contacts:", error);
                                        resolve(); // Continue even if contact fetching fails
                                    }
                                });
                            });
                        }
                    }

                    // Process through the agent
                    const agentResponse = await processAgentRequest(request.message, context);
                    
                    // If agent says we need to fetch emails first
                    if (agentResponse.needsFetch) {
                        authenticateUser(async (token) => {
                            try {
                                // Fetch emails
                                const fetchResult = await fetchAndStoreEmails(token);
                                
                                // Now that we have emails, process the request again
                                const newContext = {
                                    ...context,
                                    emails: fetchResult.emails,
                                    knownContacts: fetchResult.contacts
                                };
                                
                                const finalResponse = await processAgentRequest(request.message, newContext);
                                sendResponse({ reply: finalResponse.reply });
                            } catch (error) {
                                console.error("Error fetching emails:", error);
                                sendResponse({ reply: "I had trouble accessing your emails. Please try again later." });
                            }
                        });
                        return;
                    }
                    
                    // Handle normal responses
                    sendResponse({ reply: agentResponse.reply });
                } catch (error) {
                    console.error("Error processing message:", error);
                    sendResponse({ reply: "I encountered an error processing your message. Please try again." });
                }
            })();
            
            return true;
        }
        
        if (request.action === "generateSummaryForEmail") {
            const emailId = request.emailId;
            
            if (!emailId) {
                sendResponse({success: false, error: "No email ID provided"});
                return true;
            }
            
            console.log(`Generating summary for email ${emailId}`);
            
            // Authenticate and fetch the email content
            authenticateUser(async function(token) {
                try {
                    // Fetch the email content from Gmail API
                    const email = await fetchEmailContent(token, emailId);
                    
                    if (!email) {
                        sendResponse({success: false, error: "Could not fetch email content"});
                        return;
                    }
                    
                    // Get email details
                    const subject = email.payload?.headers?.find(h => h.name === "Subject")?.value || "No Subject";
                    const from = email.from || "Unknown";
                    
                    // Extract email content
                    let emailContent = "";
                    
                    // Check if the email has a payload with parts (MIME structure)
                    if (email.payload && (email.payload.body || email.payload.parts)) {
                        // Try to get content from main body
                        if (email.payload.body && email.payload.body.data) {
                            emailContent = atob(email.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                        } 
                        // Or check in parts
                        else if (email.payload.parts) {
                            // Find text parts
                            for (const part of email.payload.parts) {
                                if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                                    const partContent = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                                    emailContent += partContent + "\n";
                                }
                            }
                        }
                    }
                    
                    // Fall back to snippet if parsing failed
                    if (!emailContent || emailContent.length < 10) {
                        emailContent = email.body || email.snippet || "No body";
                    }
                    
                    // Create a prompt for summarization
                    const prompt = `Summarize this email:\n\nSubject: ${subject}\nFrom: ${from}\nBody: ${emailContent}`;
                    
                    // Import summarizeWithGemini function
                    const { summarizeWithGemini } = await import('./geminiApi.js');
                    
                    // Generate summary
                    const summary = await summarizeWithGemini(prompt);
                    
                    if (summary) {
                        // Save the summary to storage
                        const { saveEmailSummary } = await import('./storage.js');
                        await saveEmailSummary(emailId, summary);
                        
                        sendResponse({success: true, summary: summary});
                    } else {
                        sendResponse({success: false, error: "Failed to generate summary"});
                    }
                } catch (error) {
                    console.error("Error generating summary:", error);
                    sendResponse({success: false, error: "An error occurred while generating the summary"});
                }
            });
            
            return true;
        }
    });
     
    console.log("📅 Handlers: Message handlers registered successfully");
}

// Main function to fetch emails, process their content, and summarize them
async function processEmailsAndSummarize(token) {
    try {
     
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
      // Store contacts in IndexedDB using the new function
      await storeContactsInDB(knownContacts);

      console.log("👥 Contacts found in inbox:", knownContacts);
  
      // Store emails in IndexedDB
      await storeEmails(validEmails);
      
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
  


