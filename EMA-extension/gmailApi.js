// Fetch a list of email message IDs (single batch)
export function fetchEmails(token, filter = '10') {
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

export function fetchEmailContent(token, messageId) {
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
  