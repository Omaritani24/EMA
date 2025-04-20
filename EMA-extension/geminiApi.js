// geminiApi.js
import { getSummaryFromCache, storeSummaryInCache, getEventsFromCache, storeEventsInCache } from './storage.js';
import { createBasicEventsFromEmails } from './utils.js';

const GEMINI_API_KEY = 'AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks';

export async function summarizeEmails(emails) {
    if (!emails || emails.length === 0) {
      console.warn("⚠️ No emails provided for summarization.");
      return "No summary available.";
    }
    
    try {
      // First check if we have a cached summary
      const cachedSummary = await getSummaryFromCache(emails);
      if (cachedSummary) {
        console.log("🎯 Using cached summary");
        return cachedSummary;
      }
      
      // No cached summary, proceed with API call
      console.log("🔄 No cache hit - calling Gemini API");
  
      // Clean and join email snippets into a single prompt
      const emailContent = emails.map(email => email.snippet).join("\n\n");
  
      const prompt = `Create an extremely concise summary of these emails in 2-3 short sentences only.
      Focus ONLY on the most critical information.
      Maintain a conversational tone but prioritize brevity above all else.
      The summary should fit in a small UI area without requiring scrolling.
      
      Emails to summarize:
      ${emailContent}`;
  
      console.log("📝 Constructed prompt for Gemini:\n", prompt);
  
      // Gemini API URL (v1 is the latest stable version)
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
  
      console.log("🚀 Sending request to Gemini API...");
  
      const response = await fetch(url, options);
      const data = await response.json();
  
      if (!response.ok || data.error) {
        console.error("❌ Error summarizing with Gemini:", data?.error?.message || "Unknown error");
        return "No summary available.";
      }
  
      // Extracting summary from Gemini response
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log("✅ Summary received:", summary);
      
      // Store the summary in cache for future use
      if (summary) {
        await storeSummaryInCache(emails, summary);
      }
      
      return summary || "No summary generated.";
    } catch (err) {
      console.error("❌ Network/Fetch error:", err);
      return "No summary available.";
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
  
