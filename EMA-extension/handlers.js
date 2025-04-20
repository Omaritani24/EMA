// handlers.js
import { authenticateUser, forceReauthenticate } from './auth.js';
import { fetchEmails, fetchEmailContent } from './gmailApi.js';
import { summarizeEmails, extractCalendarEvents } from './geminiApi.js';
import { fetchCalendarEvents, addEventToCalendar, syncCalendarEvents, verifyEventInCalendar } from './calendar.js';
import { initSummaryDB, storeEmails, getSummaryFromCache, storeSummaryInCache, getEventsFromCache, storeEventsInCache, cleanupOldCacheEntries, getCachedItem, storeCachedItem } from './storage.js';
import {standardizeDate, convertTimeToISO, getEndTime, generateEmailContentHash, createBasicEventsFromEmails}  from './utils.js';

export function registerHandlers() {
    // Trigger authentication and processing on extension installation or startup
    chrome.runtime.onInstalled.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    
    chrome.runtime.onStartup.addListener(() => {
        authenticateUser(processEmailsAndSummarize);
    });
    

    // Main message listener
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "getEmails") {
            const filter = request.filter || '10';
            
            // Authenticate and fetch emails with the filter
            authenticateUser(async function(token) {
                try {
                    const messages = await fetchEmails(token, filter);
                    
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
            
            // Generate summary using Gemini API (with caching)
            summarizeEmails(emails).then(summary => {
                sendResponse({summary: summary});
            });
            
            return true; // Required for async response
        }
        
        if (request.action === "extractEvents") {
            // Get emails from the request or from storage
            if (request.emails && request.emails.length > 0) {
                extractCalendarEvents(request.emails).then(events => {
                    sendResponse({events: events});
                });
            } else {
                chrome.storage.local.get(['emails'], function(result) {
                    const emails = result.emails || [];
                    extractCalendarEvents(emails).then(events => {
                        sendResponse({events: events});
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
                // Get both pendingEmail and contacts in one go
                const storage = await new Promise(resolve => {
                    chrome.storage.local.get(['pendingEmail', 'knownContacts'], resolve);
                });
                
                const pendingEmail = storage.pendingEmail;
                const contacts = storage.knownContacts || [];
                
                const userMessage = request.message.toLowerCase();
                
                // ✅ Handle YES: send immediately
                if (userMessage === "yes" && pendingEmail) {
                    const { to, subject, body } = pendingEmail;
                
                    if (!to || !subject || !body) {
                        sendResponse({ reply: "⚠️ Sorry, I don't have a complete email to send. Try again with more context." });
                        return;
                    }
                
                    authenticateUser(async (token) => {
                        try {
                            await sendEmail(token, to, subject, body);
                            chrome.storage.local.remove('pendingEmail');
                            sendResponse({ reply: `✅ Email sent to ${to}. What else can I help you with?` });
                        } catch (err) {
                            sendResponse({ reply: "❌ Failed to send the email. Please try again." });
                        }
                    });
                
                    return;
                }
                
                // ✅ Handle NO: cancel
                if (userMessage === "no" && pendingEmail) {
                    chrome.storage.local.remove('pendingEmail');
                    sendResponse({ reply: "🛑 No problem. What else can I help you with?" });
                    return;
                }
    
                // Check if the user specifically wants to send an email
                const isEmailRequest = /send\s+(an|a)\s+email|write\s+(an|a)\s+email|email\s+to|compose\s+(an|a)\s+email|draft\s+(an|a)\s+email/i.test(request.message);
                
                // If not an email request, process as normal conversation
                if (!isEmailRequest) {
                    // Create a conversational prompt that handles English and Arabizi
                    const prompt = `You are EMA (Email Management Assistant), a helpful and friendly AI assistant.
                    You can understand both English and Arabic written in English letters (Arabizi/Franco-Arab).
    
                    Important language rules:
                    - Keep responses friendly and natural in the appropriate language
                    - Keep all email analysis functionality working as normal
                    
                    Context:
                    The user message is not asking to send an email. This is just a normal conversation.
                    
                    User message: ${request.message}`;
                    
                    // First check cache before calling API
                    const cacheKey = `chat_${generateEmailContentHash([{snippet: request.message}])}`;
                    const cachedResponse = await getCachedItem(cacheKey);
                    
                    if (cachedResponse) {
                        console.log("🎯 Using cached chat response");
                        sendResponse({reply: cachedResponse});
                        return;
                    }
                    
                    // No cache hit, call Gemini API
                    const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";
                    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
                    
                    const requestBody = {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            topP: 0.8,
                            topK: 40
                        }
                    };
                    
                    try {
                        const response = await fetch(url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody)
                        });
                        
                        const data = await response.json();
                        
                        if (!response.ok || data.error) {
                            console.error("Error processing message:", data?.error?.message || "Unknown error");
                            sendResponse({reply: "Sorry, I encountered an error. Please try again."});
                            return;
                        }
                        
                        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                                    "I couldn't process that. Please try again.";
                        
                        // Cache the response
                        await storeCachedItem(cacheKey, reply);
                        
                        sendResponse({reply: reply});
                    } catch (error) {
                        console.error("Error in message processing:", error);
                        sendResponse({reply: "Sorry, I encountered an error processing your message."});
                    }
                    return;
                }
                
                // Continue with the email processing ONLY if it's an email request
                let contactLines = "";
    
                if (Array.isArray(contacts) && contacts.length > 0) {
                    contactLines = contacts.map(([name, email]) => `- ${name}: ${email}`).join('\n');
                } else {
                    contactLines = "- someone@example.com";
                }
            
                // ✅ Generate email from freeform input using Gemini
                const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";
                const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
                
                const prompt = `
                You are an email assistant. You MUST generate a professional email based on the user's request.
                
                1. ONLY use the contacts listed below.
                2. Do NOT invent contacts. If no match, clearly say "Contact not found", and ask for email  "
                3. The subject and body should directly reflect what the user asked.
                4. the email should be professional and well written, and a proper length.
                5. sign it with the users name from the email that you are sending from.(do not write sent from)
                6. Follow this format exactly:
                
                To: [recipient@example.com]  
                Subject: [email subject]  
                Body:  
                [email message]
                
                Known contacts:
                ${contactLines}
                
                User said: "${request.message}"
                `;
                
                try {
                    const res = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    });
            
                    const data = await res.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Couldn't generate an email.";
            
                    const toMatch = text.match(/To:\s*(.*)/i);
                    const subjectMatch = text.match(/Subject:\s*(.*)/i);
                    const bodyMatch = text.match(/Body:\s*([\s\S]*)/i);
                    
                    if (!toMatch || !subjectMatch || !bodyMatch) {
                        sendResponse({ reply: "❌ I couldn't generate a complete email. Please rephrase your request or provide more details." });
                        return;
                    }
                    
                    const to = toMatch[1].trim();
                    const subject = subjectMatch[1].trim();
                    const body = bodyMatch[1].trim();
                    
            
                    chrome.storage.local.set({
                        pendingEmail: { to, subject, body }
                    });
            
                    sendResponse({
                        reply: `Here's your email:\n\nTo: ${to}\nSubject: ${subject}\n\n${body}\n\nDo you want to send this? (Yes/No)`
                    });
                } catch (err) {
                    console.error("❌ Gemini error:", err);
                    sendResponse({ reply: "❌ Error generating the email. Try again later." });
                }
            })();
            
            return true;
        }
    });
     
}

// Main function to fetch emails, process their content, and summarize them
async function processEmailsAndSummarize(token) {
    try {
      // Run cache cleanup occasionally
      await cleanupOldCacheEntries();
      
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

