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
  // Adjust maxResults as needed (here set to 50)
  return fetch("https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
    .then(response => response.json())
    .then(data => {
      if (data.messages) {
        console.log("Emails fetched:", data.messages);
        return data.messages; // Return array of message objects
      } else {
        console.warn("No emails found.");
        return [];
      }
    })
    .catch(error => {
      console.error("Error fetching emails:", error);
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

// Send email content to ChatGPT API to summarize them
function summarizeEmails(emails) {
  // Combine key parts of each email into a single prompt.
  // Here we use the 'snippet' field, but you can include more details if needed.
  const emailContent = emails.map(email => email.snippet).join("\n\n");

  const prompt = `Please provide a concise summary of the following emails:\n\n${emailContent}`;

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // WARNING: For security, do not expose your API key in client-side code.
      "Authorization": `Bearer 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`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an assistant that summarizes email content." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 150
    })
  })
    .then(response => response.json())
    .then(data => {
      console.log("ChatGPT API response:", data);
      const summary = data.choices[0].message.content;
      console.log("Summary:", summary);
      return summary;
    })
    .catch(error => {
      console.error("Error summarizing emails:", error);
      return null;
    });
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
