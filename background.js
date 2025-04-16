// background.js

// Authenticate user and get OAuth token
function authenticateUser(callback) {
  chrome.identity.getAuthToken({ interactive: true }, function (token) {
    if (chrome.runtime.lastError) {
      console.error("Authentication failed:", chrome.runtime.lastError);
      return;
    }
    console.log("User authenticated. Token:", token);
    callback(token);
  });
}

// Fetch a list of email message IDs (single batch)
function fetchEmails(token) {
  return fetch("https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20", {
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

  // Clean and join email snippets into a single prompt
  const emailContent = emails.map(email => email.snippet).join("\n\n");

  const prompt = `Please summarize the following emails, highlighting key points in a brief paragraph\n\n${emailContent}`;

  console.log("📝 Constructed prompt for Gemini:\n", prompt);

  // Gemini API URL (v1 is the latest stable version)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  };

  console.log("🚀 Sending request to Gemini API...");

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("❌ Error summarizing with Gemini:", data?.error?.message || "Unknown error");
      return "No summary available.";
    }

    // Extracting summary from Gemini response
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("✅ Summary received:", summary);
    return summary || "No summary generated.";
  } catch (err) {
    console.error("❌ Network/Fetch error:", err);
    return "No summary available.";
  }
}

// Main function to fetch emails, process their content, and summarize them
function processEmailsAndSummarize(token) {
  fetchEmails(token).then(messages => {
    // Fetch full content for each message ID
    let emailPromises = messages.map(msg => fetchEmailContent(token, msg.id));
    Promise.all(emailPromises).then(fullEmails => {
      // Filter out any failed fetches
      fullEmails = fullEmails.filter(email => email !== null);
      
      // Optionally store the full emails in Chrome Storage
      chrome.storage.local.set({ emails: fullEmails }, () => {
        console.log("Emails stored in Chrome Storage.");
      });
      
      // Send email content to ChatGPT for summarization
      summarizeEmails(fullEmails).then(summary => {
        if (summary) {
          // Store the summary in Chrome Storage for use in your extension's UI
          chrome.storage.local.set({ summary: summary }, () => {
            console.log("Summary stored in Chrome Storage.");
          });
        }
      });
    });
  });
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
        // Return emails from storage
        chrome.storage.local.get(['emails'], function(result) {
            sendResponse({emails: result.emails || []});
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
            - Keep responses concise but informative
            - Don't automatically summarize unless specifically asked

            User's message: ${request.message}

            Please respond naturally to the user's message.`;

            try {
                const response = await summarizeEmails([{snippet: prompt}]);
                sendResponse({reply: response});
            } catch (error) {
                sendResponse({reply: "I'm having trouble processing your request right now. Could you try again?"});
            }
        });
        return true;
    }
});
