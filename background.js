// background.js

// Authenticate user and get OAuth token
function authenticateUser(callback) {
  chrome.identity.getAuthToken({ 
    interactive: true,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events"
    ]
  }, function (token) {
    if (chrome.runtime.lastError) {
      console.error("Authentication failed:", chrome.runtime.lastError);
      return;
    }
    console.log("User authenticated. Token received successfully.");
    callback(token);
  });
}

// Initialize the IndexedDB for caching summaries
function initSummaryDB() {
  return new Promise((resolve, reject) => {
    const dbRequest = indexedDB.open('EMADatabase', 1);
    
    dbRequest.onupgradeneeded = function(event) {
      const db = event.target.result;
      
      // Create a store for email summaries
      if (!db.objectStoreNames.contains('summaries')) {
        const summaryStore = db.createObjectStore('summaries', { keyPath: 'id' });
        summaryStore.createIndex('hash', 'hash', { unique: true });
        summaryStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for email metadata
      if (!db.objectStoreNames.contains('emails')) {
        const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
        emailStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for calendar events
      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'id' });
        eventStore.createIndex('timestamp', 'timestamp', { unique: false });
        eventStore.createIndex('eventDate', 'eventDate', { unique: false });
      }
    };
    
    dbRequest.onsuccess = function(event) {
      console.log("✅ IndexedDB initialized successfully");
      resolve(event.target.result);
    };
    
    dbRequest.onerror = function(event) {
      console.error("❌ Error initializing IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Function to store emails in IndexedDB
async function storeEmails(emails) {
  try {
    const db = await initSummaryDB();
    const transaction = db.transaction(['emails'], 'readwrite');
    const emailStore = transaction.objectStore('emails');
    
    // Timestamp for this batch
    const timestamp = Date.now();
    
    // Store each email with timestamp
    emails.forEach(email => {
      emailStore.put({
        id: email.id,
        data: email,
        timestamp: timestamp
      });
    });
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`✅ Stored ${emails.length} emails in IndexedDB`);
        resolve();
      };
      transaction.onerror = (event) => {
        console.error("❌ Error storing emails:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error in storeEmails:", error);
  }
}

// Extract calendar events from emails using Gemini API
async function extractCalendarEvents(emails) {
  // Replace with your actual Gemini API key
  const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";

  if (!emails || emails.length === 0) {
    console.warn("⚠️ No emails provided for event extraction.");
    return [];
  }
  
  try {
    // Check if we have cached events
    const cachedEvents = await getEventsFromCache();
    if (cachedEvents && cachedEvents.length > 0) {
      console.log("🎯 Using cached calendar events");
      return cachedEvents;
    }
    
    // No cached events, proceed with API call
    console.log("🔄 Extracting calendar events using Gemini API");

    // Clean and join email snippets into a single prompt
    const emailContent = emails.map(email => email.snippet).join("\n\n");

    const prompt = `Extract all dates, times, and events from these emails. 
    For each event, please provide:
    1. Title of the event
    2. Date (in YYYY-MM-DD format)
    3. Time (if available)
    4. Location (if available)
    5. A brief description

    Format the output as a JSON array with objects containing these fields:
    [{
      "title": "Event title",
      "date": "YYYY-MM-DD",
      "time": "HH:MM AM/PM",
      "location": "Location",
      "description": "Brief description of the event"
    }]

    Only extract real events with actual dates. Do not include hypothetical events or general mentions of days.
    If there are no events, return an empty array.
    
    Emails to analyze:
    ${emailContent}`;

    console.log("📝 Constructed prompt for event extraction:\n", prompt);

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
      return [];
    }

    // Extract events from Gemini response
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("✅ Raw event extraction received:", rawText);
    
    // Parse JSON from response
    let events = [];
    try {
      // Find the JSON part in the response
      const jsonMatch = rawText.match(/\[\s*\{.*\}\s*\]/s);
      if (jsonMatch) {
        const jsonText = jsonMatch[0];
        events = JSON.parse(jsonText);
        
        // Add unique IDs and timestamps to events
        events = events.map((event, index) => ({
          ...event,
          id: `event_${Date.now()}_${index}`,
          timestamp: Date.now(),
          eventDate: new Date(event.date).getTime() || Date.now(),
          added: false
        }));
      }
    } catch (error) {
      console.error("❌ Error parsing events JSON:", error);
      // Try a more forgiving approach if the JSON is malformed
      events = extractEventsFromText(rawText);
    }
    
    console.log("✅ Extracted events:", events);
    
    // Store events in cache
    if (events.length > 0) {
      await storeEventsInCache(events);
    }
    
    return events;
  } catch (err) {
    console.error("❌ Network/Fetch error in event extraction:", err);
    return [];
  }
}

// Fallback function to extract events from text if JSON parsing fails
function extractEventsFromText(text) {
  const events = [];
  
  // Look for event-like structures in the text
  const eventMatches = text.match(/title[:\s]+["']?([^"'\n]+)["']?.*?date[:\s]+["']?(\d{4}-\d{2}-\d{2})["']?/gis);
  
  if (eventMatches) {
    eventMatches.forEach((match, index) => {
      const titleMatch = match.match(/title[:\s]+["']?([^"'\n]+)["']?/i);
      const dateMatch = match.match(/date[:\s]+["']?(\d{4}-\d{2}-\d{2})["']?/i);
      const timeMatch = match.match(/time[:\s]+["']?([^"'\n]+)["']?/i);
      const locationMatch = match.match(/location[:\s]+["']?([^"'\n]+)["']?/i);
      const descriptionMatch = match.match(/description[:\s]+["']?([^"'\n]+)["']?/i);
      
      if (titleMatch && dateMatch) {
        events.push({
          id: `event_${Date.now()}_${index}`,
          title: titleMatch[1].trim(),
          date: dateMatch[1].trim(),
          time: timeMatch ? timeMatch[1].trim() : "",
          location: locationMatch ? locationMatch[1].trim() : "",
          description: descriptionMatch ? descriptionMatch[1].trim() : "",
          timestamp: Date.now(),
          eventDate: new Date(dateMatch[1].trim()).getTime() || Date.now(),
          added: false
        });
      }
    });
  }
  
  return events;
}

// Store events in cache
async function storeEventsInCache(events) {
  try {
    const db = await initSummaryDB();
    const transaction = db.transaction(['events'], 'readwrite');
    const eventStore = transaction.objectStore('events');
    
    // Store each event
    events.forEach(event => {
      eventStore.put(event);
    });
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = function() {
        console.log("✅ Events stored in cache");
        chrome.storage.local.set({ events: events }, () => {
          console.log("Events also stored in Chrome Storage.");
        });
        resolve();
      };
      
      transaction.onerror = function(event) {
        console.error("❌ Error storing events in cache:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error in storeEventsInCache:", error);
  }
}

// Get events from cache
async function getEventsFromCache() {
  try {
    // First check if events are in Chrome Storage for quick access
    const storageResult = await new Promise((resolve) => {
      chrome.storage.local.get(['events'], function(result) {
        resolve(result.events || null);
      });
    });
    
    if (storageResult && storageResult.length > 0) {
      return storageResult;
    }
    
    // If not in Chrome Storage, check IndexedDB
    const db = await initSummaryDB();
    const transaction = db.transaction(['events'], 'readonly');
    const eventStore = transaction.objectStore('events');
    
    return new Promise((resolve, reject) => {
      const request = eventStore.getAll();
      
      request.onsuccess = function(event) {
        const events = event.target.result || [];
        
        // Filter out events that are more than 7 days old
        const currentTime = Date.now();
        const filteredEvents = events.filter(event => {
          const eventAge = currentTime - event.timestamp;
          return eventAge < 7 * 24 * 60 * 60 * 1000; // 7 days
        });
        
        // Sort by event date, closest first
        filteredEvents.sort((a, b) => a.eventDate - b.eventDate);
        
        resolve(filteredEvents);
      };
      
      request.onerror = function(event) {
        console.error("❌ Error retrieving events from cache:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error in getEventsFromCache:", error);
    return [];
  }
}

// Add event to Google Calendar
async function addEventToCalendar(token, event) {
  try {
    // Format the event for Google Calendar API
    const calendarEvent = {
      'summary': event.title,
      'location': event.location || '',
      'description': event.description || '',
      'start': {
        'dateTime': `${event.date}T${convertTimeToISO(event.time) || '09:00:00'}`,
        'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      'end': {
        'dateTime': `${event.date}T${getEndTime(event.time) || '10:00:00'}`,
        'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
    
    console.log("🔄 Attempting to add event to calendar:", calendarEvent);
    
    // Call Google Calendar API to create event
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(calendarEvent)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("❌ Calendar API error:", data.error);
      
      // Check if this is a permission/scope issue
      if (data.error?.status === 'PERMISSION_DENIED' || 
          data.error?.message?.includes('insufficient authentication scopes')) {
        console.error("❌ Authentication scope issue detected");
        // Get a new token with the right scopes by requesting interactive authentication
        throw new Error('Calendar permission denied. Please reload the extension to authorize calendar access.');
      }
      
      throw new Error(data.error?.message || 'Failed to add event to calendar');
    }
    
    console.log("✅ Event added to calendar:", data);
    
    // Update the event in our cache to mark it as added
    await markEventAsAdded(event.id);
    
    return data;
  } catch (error) {
    console.error("❌ Error adding event to calendar:", error);
    throw error;
  }
}

// Mark an event as added in the cache
async function markEventAsAdded(eventId) {
  try {
    // Update in Chrome storage first
    const storageResult = await new Promise((resolve) => {
      chrome.storage.local.get(['events'], function(result) {
        const events = result.events || [];
        const updatedEvents = events.map(event => {
          if (event.id === eventId) {
            return { ...event, added: true };
          }
          return event;
        });
        chrome.storage.local.set({ events: updatedEvents }, () => {
          resolve(true);
        });
      });
    });
    
    // Update in IndexedDB
    const db = await initSummaryDB();
    const transaction = db.transaction(['events'], 'readwrite');
    const eventStore = transaction.objectStore('events');
    
    return new Promise((resolve, reject) => {
      const request = eventStore.get(eventId);
      
      request.onsuccess = function(event) {
        const eventData = event.target.result;
        if (eventData) {
          eventData.added = true;
          eventStore.put(eventData);
        }
      };
      
      transaction.oncomplete = function() {
        resolve(true);
      };
      
      transaction.onerror = function(event) {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error marking event as added:", error);
  }
}

// Helper function to convert 12-hour time to ISO time format
function convertTimeToISO(timeStr) {
  if (!timeStr) return '09:00:00'; // Default time if none provided
  
  try {
    // Handle various time formats
    let hours = 0;
    let minutes = 0;
    
    // Try to parse the time string
    if (timeStr.match(/(\d+)(?::(\d+))?\s*(am|pm)/i)) {
      const [_, hourStr, minuteStr, ampm] = timeStr.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
      hours = parseInt(hourStr);
      minutes = minuteStr ? parseInt(minuteStr) : 0;
      
      // Convert to 24-hour format
      if (ampm.toLowerCase() === 'pm' && hours < 12) {
        hours += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hours = 0;
      }
    } else if (timeStr.match(/(\d+):(\d+)/)) {
      // Handle 24-hour format
      const [_, hourStr, minuteStr] = timeStr.match(/(\d+):(\d+)/);
      hours = parseInt(hourStr);
      minutes = parseInt(minuteStr);
    }
    
    // Ensure valid ranges
    hours = Math.min(23, Math.max(0, hours));
    minutes = Math.min(59, Math.max(0, minutes));
    
    // Format to ISO time
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  } catch (error) {
    console.error("❌ Error converting time format:", error);
    return '09:00:00'; // Default time if parsing fails
  }
}

// Helper function to calculate end time (1 hour after start by default)
function getEndTime(timeStr) {
  const startTime = convertTimeToISO(timeStr);
  if (startTime === '09:00:00') return '10:00:00'; // Default end time
  
  try {
    const [hours, minutes] = startTime.split(':').map(num => parseInt(num));
    
    // Add 1 hour
    let endHours = hours + 1;
    if (endHours > 23) {
      endHours = 23;
      minutes = 59;
    }
    
    return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  } catch (error) {
    console.error("❌ Error calculating end time:", error);
    return '10:00:00'; // Default end time if calculation fails
  }
}

// Generate a hash for email content to use as cache key
function generateEmailContentHash(emails) {
  // Create a string from the email IDs and snippets
  const contentString = emails
    .map(email => `${email.id}:${email.snippet?.substring(0, 100)}`)
    .sort()
    .join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < contentString.length; i++) {
    const char = contentString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Check if a summary exists in cache for given emails
async function getSummaryFromCache(emails) {
  try {
    // Generate a hash for the email content
    const contentHash = generateEmailContentHash(emails);
    
    const db = await initSummaryDB();
    const transaction = db.transaction(['summaries'], 'readonly');
    const summaryStore = transaction.objectStore('summaries');
    const hashIndex = summaryStore.index('hash');
    
    return new Promise((resolve, reject) => {
      const request = hashIndex.get(contentHash);
      
      request.onsuccess = function(event) {
        const cachedSummary = event.target.result;
        
        if (cachedSummary) {
          console.log("✅ Summary found in cache:", cachedSummary);
          
          // Check if cache is still valid (less than 24 hours old)
          const age = Date.now() - cachedSummary.timestamp;
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
          
          if (age < maxAge) {
            resolve(cachedSummary.summary);
          } else {
            console.log("⚠️ Cached summary expired");
            resolve(null);
          }
        } else {
          console.log("⚠️ No cached summary found");
          resolve(null);
        }
      };
      
      request.onerror = function(event) {
        console.error("❌ Error retrieving cached summary:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error in getSummaryFromCache:", error);
    return null;
  }
}

// Store a summary in the cache
async function storeSummaryInCache(emails, summary) {
  try {
    const contentHash = generateEmailContentHash(emails);
    
    const db = await initSummaryDB();
    const transaction = db.transaction(['summaries'], 'readwrite');
    const summaryStore = transaction.objectStore('summaries');
    
    // Create a unique ID
    const summaryId = 'summary_' + Date.now();
    
    summaryStore.put({
      id: summaryId,
      hash: contentHash,
      summary: summary,
      timestamp: Date.now(),
      emailCount: emails.length
    });
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = function() {
        console.log("✅ Summary stored in cache");
        resolve();
      };
      
      transaction.onerror = function(event) {
        console.error("❌ Error storing summary in cache:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("❌ Error in storeSummaryInCache:", error);
  }
}

// Clean up old cache entries
async function cleanupOldCacheEntries() {
  try {
    const db = await initSummaryDB();
    const transaction = db.transaction(['summaries', 'emails', 'events'], 'readwrite');
    const summaryStore = transaction.objectStore('summaries');
    const emailStore = transaction.objectStore('emails');
    const eventStore = transaction.objectStore('events');
    
    // Get all summary entries sorted by timestamp
    const summaryTimestampIndex = summaryStore.index('timestamp');
    const emailTimestampIndex = emailStore.index('timestamp');
    const eventTimestampIndex = eventStore.index('timestamp');
    
    // Max age for cache entries (7 days)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAge;
    
    // Clean up old summaries
    const summaryRange = IDBKeyRange.upperBound(cutoffTime);
    summaryTimestampIndex.openCursor(summaryRange).onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        summaryStore.delete(cursor.value.id);
        cursor.continue();
      }
    };
    
    // Clean up old emails
    const emailRange = IDBKeyRange.upperBound(cutoffTime);
    emailTimestampIndex.openCursor(emailRange).onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        emailStore.delete(cursor.value.id);
        cursor.continue();
      }
    };
    
    // Clean up old events
    const eventRange = IDBKeyRange.upperBound(cutoffTime);
    eventTimestampIndex.openCursor(eventRange).onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        eventStore.delete(cursor.value.id);
        cursor.continue();
      }
    };
    
    return new Promise((resolve) => {
      transaction.oncomplete = function() {
        console.log("✅ Old cache entries cleaned up");
        resolve();
      };
    });
  } catch (error) {
    console.error("❌ Error cleaning up old cache entries:", error);
  }
}

// Fetch a list of email message IDs (single batch)
function fetchEmails(token, filter = '10') {
  let maxResults = 20; // Default max results
  
  // Adjust maxResults based on filter
  if (filter === '10') {
    maxResults = 10;
  } else if (filter === '20') {
    maxResults = 20;
  } else if (filter === 'all') {
    maxResults = 100; // Fetch more for "all" option
  }
  
  // Build the query based on filter
  let query = '';
  if (filter === 'unread') {
    query = 'is:unread';
  }
  
  // Construct the URL with query parameters
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${query ? '&q=' + encodeURIComponent(query) : ''}`;
  
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(response => response.json())
    .then(data => {
      console.log("Raw API Response:", JSON.stringify(data, null, 2));

      if (data.error) {
        console.error("❌ Gmail API Error:", data.error.message);
        return [];
      }

      if (!data.messages || data.messages.length === 0) {
        console.warn("⚠️ No emails found.");
        return [];
      }

      console.log("✅ Emails fetched:", data.messages);
      return data.messages;
    })
    .catch(error => {
      console.error("❌ Error fetching emails:", error);
      return [];
    });
}


// Fetch full email content for a given message ID
function fetchEmailContent(token, messageId) {
  return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(response => {
      console.log(`Response status for message ${messageId}:`, response.status);
      return response.json();
    })
    .then(data => {
      console.log(`Email content for message ${messageId}:`, data);
      return data;
    })
    .catch(error => {
      console.error(`Error fetching email content for message ${messageId}:`, error);
      return null;
    });
}

async function summarizeEmails(emails) {
  // Replace with your actual Gemini API key (keep it secret!)
  const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";

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

// Main function to fetch emails, process their content, and summarize them
async function processEmailsAndSummarize(token) {
  try {
    // Run cache cleanup occasionally
    await cleanupOldCacheEntries();
    
    const messages = await fetchEmails(token);
    
    // Fetch full content for each message ID
    let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
    const fullEmails = await Promise.all(emailPromises);
    
    // Filter out any failed fetches
    const validEmails = fullEmails.filter(email => email !== null);
    
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

// Trigger authentication and processing on extension installation or startup
chrome.runtime.onInstalled.addListener(() => {
  authenticateUser(processEmailsAndSummarize);
});

chrome.runtime.onStartup.addListener(() => {
  authenticateUser(processEmailsAndSummarize);
});

// Example function to get the summary from Chrome Storage
function getSummary() {
    chrome.storage.local.get(['summary'], function(result) {
        if (result.summary) {
            // Send the summary to the popup
            chrome.runtime.sendMessage({ summary: result.summary });
        }
    });
}

// Call this function when you want to retrieve the summary
getSummary();

// Add this to your existing background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getEmails") {
        // Get the filter from the request
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
                    eventId: result.id
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
                                eventId: result.id
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
                        error: error.message
                    });
                }
            }
        });
        return true; // Required for async response
    }
    
    if (request.action === "processMessage") {
        chrome.storage.local.get(['emails'], async function(result) {
            const emails = result.emails || [];
            
            // Create a more conversational prompt
            const prompt = `You are EMA (Email Management Assistant), a helpful and friendly AI assistant.
            You have access to the user's recent emails and can help answer questions about them.
            
            Context (Recent Emails):
            ${emails.map(email => `Email: ${email.snippet}`).join('\n')}

            Instructions:
            - Be conversational and friendly
            - Only provide information that's relevant to the user's question
            - If asked about emails you don't have access to, let the user know
            
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
                contents: [{ parts: [{ text: prompt }] }]
            };
            
            fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody)
            })
            .then(response => response.json())
            .then(data => {
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't process that. Please try again.";
                
                // Cache the response
                storeCachedItem(cacheKey, reply);
                
                sendResponse({reply: reply});
            })
            .catch(error => {
                console.error("Error processing message:", error);
                sendResponse({reply: "Sorry, I encountered an error processing your message."});
            });
        });
        return true; // Required for async response
    }
});

// Helper functions for the chat cache
async function getCachedItem(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], function(result) {
            resolve(result[key] || null);
        });
    });
}

async function storeCachedItem(key, value) {
    chrome.storage.local.set({[key]: value}, function() {
        console.log(`Cached item stored with key: ${key}`);
    });
}

// Force re-authentication by removing tokens and getting a fresh one
function forceReauthenticate(callback) {
  console.log("🔄 Forcing re-authentication...");
  
  // First clear any cached tokens
  chrome.identity.clearAllCachedAuthTokens(() => {
    console.log("🧹 Cleared all cached auth tokens");
    
    // Now request a new token with all required scopes
    chrome.identity.getAuthToken({ 
      interactive: true,
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      ]
    }, function (token) {
      if (chrome.runtime.lastError) {
        console.error("❌ Re-authentication failed:", chrome.runtime.lastError);
        if (callback) callback(null);
        return;
      }
      
      console.log("✅ Re-authentication successful");
      if (callback) callback(token);
    });
  });
}
