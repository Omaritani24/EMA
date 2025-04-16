// When popup opens, request emails from background script
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chat-input');
    const chatbox = document.querySelector('.chatbox');

    // Add initial greeting
    addMessageToChat("Hi! I'm EMA, your email assistant. I can help you find information in your emails or answer questions about them. What would you like to know?", 'bot');

    // Set up chat input listener
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const message = chatInput.value.trim();
            if (message) {
                // Add user message to chat
                addMessageToChat(message, 'user');
                
                // Clear input
                chatInput.value = '';
                
                // Send to background script for processing
                chrome.runtime.sendMessage(
                    {action: "processMessage", message: message},
                    function(response) {
                        if (response && response.reply) {
                            addMessageToChat(response.reply, 'bot');
                        }
                    }
                );
            }
        }
    });

    // Request initial emails from background script
    chrome.runtime.sendMessage({action: "getEmails"}, function(response) {
        if (response && response.emails) {
            updateEmailCounts(response.emails);
        }
    });
});

function addMessageToChat(text, sender) {
    const chatbox = document.querySelector('.chatbox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    chatbox.appendChild(messageDiv);
    
    // Scroll to bottom
    chatbox.scrollTop = chatbox.scrollHeight;
}

function updateEmailCounts(emails) {
    // Update the circle counts based on email categories
    let personalCount = 0;
    let workCount = 0;
    let promoCount = 0;

    emails.forEach(email => {
        // Simple categorization based on email content/labels
        if (email.labelIds && email.labelIds.includes('CATEGORY_PERSONAL')) {
            personalCount++;
        } else if (email.labelIds && email.labelIds.includes('CATEGORY_PROMOTIONS')) {
            promoCount++;
        } else {
            workCount++;
        }
    });

    // Update the UI circles
    document.querySelector('.circle-pink').textContent = personalCount;
    document.querySelector('.circle-purple').textContent = workCount;
    document.querySelector('.circle-green').textContent = promoCount;
}

// Example function to display the summary
function displaySummary(summaryText) {
    const summaryContainer = document.getElementById("summaryContainer");
    summaryContainer.textContent = summaryText; // Update the container with the summary
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
  