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
  
  // Fetch the user's emails
  function fetchEmails(token) {
    fetch("https://www.googleapis.com/gmail/v1/users/me/messages", {
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
          let emailPromises = data.messages.slice(0, 5).map(msg => fetchEmailContent(token, msg.id));
          Promise.all(emailPromises).then(emails => {
            chrome.storage.local.set({ emails: emails }, () => {
              console.log("Emails stored in Chrome Storage.");
            });
          });
        } else {
          console.warn("No emails found.");
          chrome.storage.local.set({ emails: [] });
        }
      })
      .catch(error => console.error("Error fetching emails:", error));
  }
  
  // Fetch full email content
  function fetchEmailContent(token, messageId) {
    return fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(response => response.json())
      .then(emailData => {
        let snippet = emailData.snippet || "No content available";
        return { id: messageId, snippet: snippet };
      });
  }
  
  // Authenticate and fetch emails on extension load
  chrome.runtime.onInstalled.addListener(() => {
    authenticateUser(fetchEmails);
  });
  