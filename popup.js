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
