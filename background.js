// background.js

// Authenticate user and get OAuth token
function authenticateUser(callback) {
  chrome.identity.getAuthToken({ 
    interactive: true,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/gmail.send"
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
    const dbRequest = indexedDB.open('EMADatabase', 2); // Increase version to trigger upgrade
    
    dbRequest.onupgradeneeded = function(event) {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      console.log(`Upgrading IndexedDB from version ${oldVersion} to ${db.version}`);
      
      // Create a store for email summaries if it doesn't exist
      if (!db.objectStoreNames.contains('summaries')) {
        console.log("Creating 'summaries' store");
        const summaryStore = db.createObjectStore('summaries', { keyPath: 'id' });
        summaryStore.createIndex('hash', 'hash', { unique: true });
        summaryStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for email metadata if it doesn't exist
      if (!db.objectStoreNames.contains('emails')) {
        console.log("Creating 'emails' store");
        const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
        emailStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Create a store for calendar events if it doesn't exist
      if (!db.objectStoreNames.contains('events')) {
        console.log("Creating 'events' store");
        const eventStore = db.createObjectStore('events', { keyPath: 'id' });
        eventStore.createIndex('timestamp', 'timestamp', { unique: false });
        eventStore.createIndex('eventDate', 'eventDate', { unique: false });
      }
    };
    
    dbRequest.onsuccess = function(event) {
      console.log("IndexedDB initialized successfully");
      resolve(event.target.result);
    };
    
    dbRequest.onerror = function(event) {
      console.error(" Error initializing IndexedDB:", event.target.error);
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
        console.log(`Stored ${emails.length} emails in IndexedDB`);
        resolve();
      };
      transaction.onerror = (event) => {
        console.error(" Error storing emails:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error(" Error in storeEmails:", error);
  }
}

// Extract calendar events from emails using Gemini API
async function extractCalendarEvents(emails) {
  // Replace with your actual Gemini API key
  const GEMINI_API_KEY = "AIzaSyBhlM0p5vFbeG0uR9oqb66ya2Gd8NuY6Ks";

  if (!emails || emails.length === 0) {
    console.warn(" No emails provided for event extraction.");
    return [];
  }
  
  try {
    // Check if we have cached events
    const cachedEvents = await getEventsFromCache();
    if (cachedEvents && cachedEvents.length > 0) {
      console.log("Using cached calendar events");
      return cachedEvents;
    let cachedEvents = [];
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
    console.log(" Extracting calendar events using Gemini API");

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

    // If we've hit the rate limit within the last hour, use a fallback approach
    if (rateLimitStatus) {
      const now = Date.now();
      if (now - rateLimitStatus < 3600000) { // 1 hour
        console.warn("⚠️ Gemini API rate limited - using fallback event detection");
        return createBasicEventsFromEmails(emails);
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
      // Try a more forgiving approach if the JSON is malformed
      events = extractEventsFromText(rawText, emailToEventMap);
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

// Helper function to standardize date formats
function standardizeDate(dateStr) {
  // Try different date formats
  let date;
  
  // Try direct parsing first
  date = new Date(dateStr);
  if (!isNaN(date)) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }
  
  // Try MM/DD/YYYY or DD/MM/YYYY
  const slashParts = dateStr.split(/[\/.-]/);
  if (slashParts.length === 3) {
    // Assume MM/DD/YYYY first
    const month = parseInt(slashParts[0]);
    const day = parseInt(slashParts[1]);
    let year = parseInt(slashParts[2]);
    
    // Add century if needed
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    
    // Validate parts
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = new Date(year, month - 1, day);
      if (!isNaN(date)) {
        return date.toISOString().split('T')[0];
      }
    }
    
    // Try DD/MM/YYYY if MM/DD/YYYY failed
    const dayAlt = parseInt(slashParts[0]);
    const monthAlt = parseInt(slashParts[1]);
    
    if (monthAlt >= 1 && monthAlt <= 12 && dayAlt >= 1 && dayAlt <= 31) {
      date = new Date(year, monthAlt - 1, dayAlt);
      if (!isNaN(date)) {
        return date.toISOString().split('T')[0];
      }
    }
  }
  
  // If all parsing fails, return the original string
  return dateStr;
}

// Simple function to extract basic event information from emails without using AI
function createBasicEventsFromEmails(emails) {
  console.log("🔍 Creating basic events from email content");
  const events = [];
  const dateRegex = /(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}|\d{4}-\d{2}-\d{2})/g;
  const timeRegex = /(\d{1,2}[:\.]\d{2}\s*(am|pm|AM|PM)?)/g;
  
  emails.forEach((email, emailIndex) => {
    const snippet = email.snippet || "";
    
    // Skip if snippet is too short
    if (snippet.length < 10) return;
    
    // Look for dates in the snippet
    const dateMatches = snippet.match(dateRegex);
    if (dateMatches) {
      dateMatches.forEach((dateMatch, index) => {
        // Try to find a time near this date
        const timeMatches = snippet.match(timeRegex);
        const time = timeMatches && timeMatches.length > index ? timeMatches[index] : null;
        
        // Create a standardized date format (YYYY-MM-DD)
        const standardDate = standardizeDate(dateMatch);
        
        // Create a title from the words before and after the date
        const words = snippet.split(/\s+/);
        const datePosition = words.findIndex(word => word.includes(dateMatch));
        const titleStart = Math.max(0, datePosition - 3);
        const titleEnd = Math.min(words.length, datePosition + 4);
        const title = words.slice(titleStart, titleEnd).join(" ").replace(/[^\w\s]/g, "");
        
        events.push({
          id: `event_${Date.now()}_${emailIndex}_${index}`,
          title: title || "Event from email",
          date: standardDate,
          time: time || "",
          location: "",
          description: snippet.substring(0, 100) + "...",
          timestamp: Date.now(),
          eventDate: new Date(standardDate).getTime() || Date.now(),
          added: false,
          sourceEmailId: email.id
        });
      });
    }
  });
  
  // Store these basic events in Chrome Storage
  if (events.length > 0) {
    chrome.storage.local.set({ events: events });
  }
  
  return events;
}

// Store events in cache
async function storeEventsInCache(events) {
  try {
    // First ensure we have initialization
    const db = await initSummaryDB();
    
    // Make sure the events store exists
    if (!db.objectStoreNames.contains('events')) {
      throw new Error("Events store not found in IndexedDB");
    }
    
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
    // Store in Chrome Storage as fallback
    chrome.storage.local.set({ events: events });
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
      console.log("🎯 Using events from Chrome Storage");
      return storageResult;
    }
    
    // If not in Chrome Storage, check IndexedDB
    const db = await initSummaryDB();
    
    // Make sure the events store exists
    if (!db.objectStoreNames.contains('events')) {
      console.warn("⚠️ Events store not found in IndexedDB");
      return [];
    }
    
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
    // Return empty array if we hit an error
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

function fetchEmailContent(token, messageId) {
  return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(response => response.json())
    .then(data => {
      const headers = data.payload?.headers || [];
      const from = headers.find(h => h.name.toLowerCase() === "from")?.value || "";
      const to = headers.find(h => h.name.toLowerCase() === "to")?.value || "";

      return {
        ...data,
        from,
        to
      };
    })
    .catch(error => {
      console.error(`❌ Error fetching email content for message ${messageId}:`, error);
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
    (async () => {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['pendingEmail'], resolve);
      });
        const contacts = await new Promise(resolve => {
        chrome.storage.local.get(['knownContacts'], async result => {
          resolve(result.knownContacts || []);
           // Create a conversational prompt that handles English and Arabizi
           const prompt = `You are EMA (Email Management Assistant), a helpful and friendly AI assistant.
           You can understand both English and Arabic written in English letters (Arabizi/Franco-Arab).

           Important language rules:
           - If the user writes in English (like "what's new?" or "show my emails"), respond in English
           - If the user writes in Arabizi/Franco-Arab (like "kifak" "shu fi" "3am befham" "ma3ak"), respond in Arabizi/Franco-Arab text
           - Keep responses friendly and natural in the appropriate language
           - Keep all email analysis functionality working as normal
           
           Context (Recent Emails):
           ${emails.map(email => `Email: ${email.snippet}`).join('\n')}
           
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
        });
      });
      
      let contactLines = "";

if (Array.isArray(contacts) && contacts.length > 0) {
  contactLines = contacts.map(([name, email]) => `- ${name}: ${email}`).join('\n');
} else {
  contactLines = "- someone@example.com";
}

      const userMessage = request.message.toLowerCase();
  
      // ✅ Handle YES: send immediately
      if (userMessage === "yes" && result.pendingEmail) {
        const { to, subject, body } = result.pendingEmail;
  
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
      if (userMessage === "no" && result.pendingEmail) {
        chrome.storage.local.remove('pendingEmail');
        sendResponse({ reply: "🛑 No problem. What else can I help you with?" });
        return;
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
