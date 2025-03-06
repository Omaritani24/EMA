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
  function fetchEmails(token) {
    console.log("Using token:", token);

    fetch("https://www.googleapis.com/gmail/v1/users/me/messages", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    })
    .then(response => {
        console.log("Response status:", response.status); // Log HTTP status
        return response.json();
    })
    .then(data => {
        console.log("Raw Gmail API Response:", data);

        if (data.messages) {
            console.log(`✅ Successfully fetched ${data.messages.length} emails!`);
            
            // Fetch the first 5 emails' contents for verification
            let emailPromises = data.messages.slice(0, 5).map(msg => fetchEmailContent(token, msg.id));
            Promise.all(emailPromises).then(emails => {
                console.log("✅ Retrieved full email contents:", emails);

                // Store in Chrome Storage
                chrome.storage.local.set({ emails: emails }, () => {
                    console.log("📩 Emails stored in Chrome Storage.");
                });
            });
        } else {
            console.warn("⚠️ No emails found.");
        }
    })
    .catch(error => console.error("❌ Error fetching emails:", error));
}

  
  // Authenticate and fetch emails on extension load
  chrome.runtime.onInstalled.addListener(() => {
    authenticateUser(fetchEmails);
  });
  