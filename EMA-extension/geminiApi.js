// geminiApi.js
import { getSummaryFromCache, storeSummaryInCache, getEventsFromCache, storeEventsInCache } from './storage.js';
import { createBasicEventsFromEmails } from './utils.js';

const GEMINI_API_KEY = 'AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks';

export async function summarizeEmails(emails) {
    if (!emails || emails.length === 0) {
      console.warn("⚠️ No emails provided for summarization.");
      return "No emails to summarize.";
    }
    
    try {
      // First check if we have a cached summary - with a timeout
      const cachedSummaryPromise = getSummaryFromCache(emails);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Cache timeout')), 2000)
      );
      
      try {
        const cachedSummary = await Promise.race([cachedSummaryPromise, timeoutPromise]);
        if (cachedSummary) {
          console.log("🎯 Using cached summary");
          return cachedSummary;
        }
      } catch (cacheError) {
        console.log("Cache retrieval timed out or failed, proceeding with basic summary");
      }
      
      // Generate a basic summary immediately while the API call is in progress
      const basicSummary = generateBasicSummary(emails);
      
      // Start the API call in the background
      generateDetailedSummary(emails).then(detailedSummary => {
        if (detailedSummary) {
          // Store the detailed summary in cache for future use
          storeSummaryInCache(emails, detailedSummary).catch(err => 
            console.error("Failed to store summary in cache:", err)
          );
        }
      }).catch(err => 
        console.error("Failed to generate detailed summary:", err)
      );
      
      // Return the basic summary immediately
      return basicSummary;
      
    } catch (err) {
      console.error("❌ Error in summarizeEmails:", err);
      return generateBasicSummary(emails);
    }
}

// Helper function to generate a basic summary without API call
function generateBasicSummary(emails) {
    if (!emails || emails.length === 0) return "No emails to summarize.";
    
    const emailCount = emails.length;
    const recentSubjects = emails
      .slice(0, 3)
      .map(email => email.subject || "Untitled")
      .join(", ");
    
    return `${emailCount} recent email${emailCount > 1 ? 's' : ''} including: ${recentSubjects}`;
}

// Helper function to generate a detailed summary using Gemini API
async function generateDetailedSummary(emails) {
    try {
      const emailContent = emails.map(email => email.snippet).join("\n\n");
      
      const prompt = `Create an extremely concise summary of these emails in 2-3 short sentences only.
      Focus ONLY on the most critical information.
      Maintain a conversational tone but prioritize brevity above all else.
      The summary should fit in a small UI area without requiring scrolling.
      
      Emails to summarize:
      ${emailContent}`;
      
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
      
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 100,
          topP: 0.8,
          topK: 40
        }
      };
      
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      };
      
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data?.error?.message || "API error");
      }
      
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      
    } catch (err) {
      console.error("Failed to generate detailed summary:", err);
      return null;
    }
}
  
// Extract calendar events from emails using Gemini API
export async function extractCalendarEvents(emails) {
    // Replace with your actual Gemini API key
    const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";
  
    if (!emails || emails.length === 0) {
      console.warn(" No emails provided for event extraction.");
      return [];
    }
    
    try {
      // Check if we have cached events
      let cachedEvents;
      try {
        cachedEvents = await getEventsFromCache();
        if (cachedEvents && cachedEvents.length > 0) {
          console.log("🎯 Using cached calendar events");
          return cachedEvents;
        }
      } catch (cacheError) {
        console.error("❌ Error retrieving cached events:", cacheError);
        // Continue with API call if cache fails
      }
      
      // No cached events, proceed with API call
      console.log("🔄 Extracting calendar events using Gemini API");
  
      // Create array to track which email contains which event
      let emailToEventMap = [];
      
      // Clean and join email snippets into a single prompt
      const emailContent = emails.map((email, index) => {
        emailToEventMap.push({ 
          emailId: email.id, 
          snippet: email.snippet.substring(0, 100),
          index: index 
        });
        return `Email ${index}: ${email.snippet}`;
      }).join("\n\n");
  
      const prompt = `Extract all dates, times, and events from these emails. 
      For each event, please provide:
      1. Title of the event
      2. Date (in YYYY-MM-DD format)
      3. Time (if available)
      4. Location (if available)
      5. A brief description
      6. The email number (0, 1, 2, etc.) where you found this event
  
      Format the output as a JSON array with objects containing these fields:
      [{
        "title": "Event title",
        "date": "YYYY-MM-DD",
        "time": "HH:MM AM/PM",
        "location": "Location",
        "description": "Brief description of the event",
        "emailIndex": 0
      }]
  
      Only extract real events with actual dates. Do not include hypothetical events or general mentions of days.
      If there are no events, return an empty array.
      The emailIndex must be included for each event and should reference the email number where you found it.
      
      Emails to analyze:
      ${emailContent}`;
  
      console.log("📝 Constructed prompt for event extraction");
  
      // Check if we've hit the API rate limit
      const rateLimitKey = 'gemini_rate_limited';
      const rateLimitStatus = await new Promise(resolve => {
        chrome.storage.local.get([rateLimitKey], result => {
          resolve(result[rateLimitKey]);
        });
      });
  
      // If we've hit the rate limit within the last hour, return empty array
      if (rateLimitStatus) {
        const now = Date.now();
        if (now - rateLimitStatus < 3600000) { // 1 hour
          console.warn("⚠️ Gemini API rate limited - returning empty array");
          return [];
        } else {
          // Reset the rate limit status if it's been more than an hour
          chrome.storage.local.remove([rateLimitKey]);
        }
      }
  
      // Gemini API URL
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
  
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40
        }
      };
  
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      };
  
      console.log("🚀 Sending request to Gemini API for event extraction...");
  
      const response = await fetch(url, options);
      const data = await response.json();
  
      if (!response.ok || data.error) {
        console.error("❌ Error extracting events with Gemini:", data?.error?.message || "Unknown error");
        
        // Check if this is a quota/rate limit error
        const errorMessage = data?.error?.message || "";
        if (errorMessage.includes("quota") || errorMessage.includes("rate limit")) {
          // Store the timestamp of when we hit the rate limit
          chrome.storage.local.set({ [rateLimitKey]: Date.now() });
          // Use fallback approach
          return createBasicEventsFromEmails(emails);
        }
        
        return [];
      }
  
      // Extract events from Gemini response
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log("✅ Raw event extraction received");
      
      // Parse JSON from response
      let events = [];
      try {
        // Find the JSON part in the response
        const jsonMatch = rawText.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
          const jsonText = jsonMatch[0];
          events = JSON.parse(jsonText);
          
          // Add unique IDs, timestamps, and source email IDs to events
          events = events.map((event, index) => {
            // Map the event back to the source email ID
            const emailIndex = event.emailIndex !== undefined ? event.emailIndex : 0;
            const sourceEmail = emailToEventMap[emailIndex] || emailToEventMap[0];
            
            return {
              ...event,
              id: `event_${Date.now()}_${index}`,
              timestamp: Date.now(),
              eventDate: new Date(event.date).getTime() || Date.now(),
              added: false,
              sourceEmailId: sourceEmail ? sourceEmail.emailId : null
            };
          });
        }
      } catch (error) {
        console.error("❌ Error parsing events JSON:", error);
      }
      
      console.log("✅ Extracted events:", events.length);
      
      // Store events in cache and local storage
      if (events.length > 0) {
        try {
          await storeEventsInCache(events);
        } catch (storageError) {
          console.error("❌ Error storing events in cache:", storageError);
          // Store in local storage as fallback
          chrome.storage.local.set({ events: events });
        }
      }
      
      return events;
    } catch (err) {
      console.error("❌ Network/Fetch error in event extraction:", err);
      // In case of any error, try to extract events with a simple approach
      return createBasicEventsFromEmails(emails);
    }
}
  
// New function to process email questions dynamically
export async function processEmailQuery(query, emails) {
    if (!emails || emails.length === 0) {
      return "I don't have any emails to analyze. Please refresh your emails first.";
    }
    
    try {
      console.log("Processing email query:", query);
      
      // Format emails for better context
      const formattedEmails = emails.map((email, index) => {
        const from = email.from || "Unknown";
        const subject = email.subject || email.payload?.headers?.find(h => h.name === "Subject")?.value || "No Subject";
        const date = email.internalDate ? new Date(parseInt(email.internalDate)).toLocaleString() : "Unknown date";
        
        return `Email ${index + 1}:
          From: ${from}
          Subject: ${subject}
          Date: ${date}
          Content: ${email.snippet || "No content"}
        `;
      }).join("\n\n");
      
      const prompt = `You are EMA, an email assistant AI. Answer the following question about these emails.
      Be concise, helpful, and conversational.
      
      If asked about specific email content, provide relevant details from the emails.
      If asked for summaries, focus on the most important information.
      If asked about senders, recipients, or dates, extract that information accurately.
      
      User's question: "${query}"
      
      Emails to analyze:
      ${formattedEmails}`;
      
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;
      
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 300,
          topP: 0.8,
          topK: 40
        }
      };
      
      const options = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      };
      
      console.log("Sending query to Gemini API...");
      
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        console.error("Error processing query:", data?.error?.message || "Unknown error");
        return "I'm having trouble analyzing your emails right now. Could you try asking in a different way?";
      }
      
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return answer || "I couldn't find a good answer to your question in these emails.";
      
    } catch (error) {
      console.error("Error in processEmailQuery:", error);
      return "Sorry, I encountered an error while processing your question. Please try again.";
    }
}
  
