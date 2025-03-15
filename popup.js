document.getElementById("fetch").addEventListener("click", async function () {
    let chatbox = document.getElementById("chatbox");
    
    // Show loading message
    let loadingMessage = document.createElement("div");
    loadingMessage.className = "message bot";
    loadingMessage.textContent = "⏳ Fetching emails...";
    chatbox.appendChild(loadingMessage);

    chrome.storage.local.get("emails", async function (data) {
        chatbox.innerHTML = ""; // Clear chatbox before showing results

        if (data.emails && data.emails.length > 0) {
            for (const email of data.emails) {
                let summary = await summarizeEmail(email.snippet);

                let userMessage = document.createElement("div");
                userMessage.className = "message user";
                userMessage.textContent = "Summarize this email:";
                chatbox.appendChild(userMessage);

                let botMessage = document.createElement("div");
                botMessage.className = "message bot";
                botMessage.textContent = summary;
                chatbox.appendChild(botMessage);
            }
        } else {
            let noEmailsMessage = document.createElement("div");
            noEmailsMessage.className = "message bot";
            noEmailsMessage.textContent = "No emails found for today.";
            chatbox.appendChild(noEmailsMessage);
        }
    });
});

// Simulating an AI summary function (Replace this with OpenAI API)
async function summarizeEmail(content) {
    return `Summary: ${content.substring(0, 50)}...`; // Fake summary
}


document.addEventListener("DOMContentLoaded", () => {
    const chatbox = document.getElementById("chatbox");
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");
  
    // Load chat history from storage
    chrome.storage.local.get("chatHistory", (data) => {
      if (data.chatHistory) {
        chatbox.innerHTML = data.chatHistory;
      }
    });
  
    // Function to send message
    function sendMessage() {
      const message = messageInput.value.trim();
      if (message === "") return;
  
      // Create user message element
      const userMessage = `<div class="message user">${message}</div>`;
      chatbox.innerHTML += userMessage;
  
      // Auto-reply (Fake AI response for now)
      setTimeout(() => {
        const botMessage = `<div class="message bot">I received: "${message}"</div>`;
        chatbox.innerHTML += botMessage;
        chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to bottom
  
        // Save messages to Chrome storage
        chrome.storage.local.set({ chatHistory: chatbox.innerHTML });
      }, 1000);
  
      messageInput.value = "";
      chatbox.scrollTop = chatbox.scrollHeight; // Auto-scroll to bottom
  
      // Save messages to Chrome storage
      chrome.storage.local.set({ chatHistory: chatbox.innerHTML });
    }
  
    // Event listeners
    sendBtn.addEventListener("click", sendMessage);
    messageInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") sendMessage();
    });
  });
  