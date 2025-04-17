// When popup opens, request emails from background script
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chat-input');
    const chatbox = document.getElementById('chatbox');
    const sendButton = document.getElementById('send-button');
    const emailFilter = document.getElementById('email-filter');
    const refreshButton = document.getElementById('refresh-emails');
    const emailSummary = document.getElementById('email-summary');
    const calendarEvents = document.getElementById('calendar-events');
    const refreshEvents = document.getElementById('refresh-events');

    // Add initial greeting
    addMessageToChat("Hi! I'm EMA, your email assistant. I can help you find information in your emails or answer questions about them. What would you like to know?", 'bot');

    // Function to handle sending messages
    function sendMessage() {
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

    // Set up chat input listeners
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    sendButton.addEventListener('click', sendMessage);

    // Function to fetch emails based on filter
    function fetchEmails() {
        const filterValue = emailFilter.value;
        
        // Show loading state
        emailSummary.innerHTML = '<p class="summary-placeholder">Loading emails...</p>';
        calendarEvents.innerHTML = '<p class="events-placeholder">Scanning emails for calendar events...</p>';
        
        // Request emails from background script with filter
        chrome.runtime.sendMessage(
            {action: "getEmails", filter: filterValue},
            function(response) {
                if (response && response.emails) {
                    updateEmailCounts(response.emails);
                    generateEmailSummary(response.emails);
                    
                    // Process calendar events
                    if (response.events && response.events.length > 0) {
                        displayCalendarEvents(response.events);
                    } else {
                        extractCalendarEvents();
                    }
                } else {
                    emailSummary.innerHTML = '<p class="summary-placeholder">No emails found.</p>';
                    calendarEvents.innerHTML = '<p class="events-placeholder">No events found.</p>';
                }
            }
        );
    }

    // Function to generate email summary
    function generateEmailSummary(emails) {
        if (!emails || emails.length === 0) {
            emailSummary.innerHTML = '<p class="summary-placeholder">No emails to summarize.</p>';
            return;
        }

        // Show loading state
        emailSummary.innerHTML = '<p class="summary-placeholder">Generating summary...</p>';
        
        // Send emails to background script for summarization
        chrome.runtime.sendMessage(
            {action: "summarizeEmails", emails: emails},
            function(response) {
                if (response && response.summary) {
                    // Display the summary as text
                    emailSummary.innerHTML = `<p>${response.summary}</p>`;
                } else {
                    emailSummary.innerHTML = '<p class="summary-placeholder">Could not generate summary.</p>';
                }
            }
        );
    }
    
    // Function to extract calendar events from emails
    function extractCalendarEvents() {
        // Show loading state if not already shown
        if (!calendarEvents.querySelector('.event-item')) {
            calendarEvents.innerHTML = '<p class="events-placeholder">Scanning emails for calendar events...</p>';
        }
        
        // Request event extraction from background script
        chrome.runtime.sendMessage(
            {action: "extractEvents"},
            function(response) {
                if (response && response.events && response.events.length > 0) {
                    displayCalendarEvents(response.events);
                } else {
                    calendarEvents.innerHTML = '<p class="events-placeholder">No events found in your emails.</p>';
                }
            }
        );
    }
    
    // Function to display calendar events
    function displayCalendarEvents(events) {
        if (!events || events.length === 0) {
            calendarEvents.innerHTML = '<p class="events-placeholder">No calendar events found.</p>';
            return;
        }
        
        // Clear the current content
        calendarEvents.innerHTML = '';
        
        // Create HTML for each event
        events.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = `event-item${event.added ? ' added' : ''}`;
            eventElement.setAttribute('data-event-id', event.id);
            
            // Format date for display
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Create HTML structure for the event
            eventElement.innerHTML = `
                <div class="event-title">${event.title}</div>
                <div class="event-info">
                    <div class="event-date">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        ${formattedDate}
                    </div>
                    ${event.time ? `
                    <div class="event-time">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        ${event.time}
                    </div>
                    ` : ''}
                </div>
                ${event.location ? `
                <div class="event-location">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    ${event.location}
                </div>
                ` : ''}
                ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                ${event.added ? `
                <div class="event-added-badge">Added to Calendar</div>
                ` : `
                <button class="add-to-calendar" data-event-id="${event.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6"></path>
                        <path d="M3 10h18"></path>
                        <path d="M16 2v4"></path>
                        <path d="M8 2v4"></path>
                        <path d="M12 14v4"></path>
                        <path d="M10 16h4"></path>
                    </svg>
                    Add to Calendar
                </button>
                `}
            `;
            
            calendarEvents.appendChild(eventElement);
        });
        
        // Add event listeners to the "Add to Calendar" buttons
        const addButtons = calendarEvents.querySelectorAll('.add-to-calendar');
        addButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                const eventId = e.currentTarget.getAttribute('data-event-id');
                addEventToCalendar(eventId, events);
            });
        });
    }
    
    // Function to add an event to Google Calendar
    function addEventToCalendar(eventId, allEvents) {
        // Find the event with the matching ID
        const event = allEvents.find(e => e.id === eventId);
        if (!event) return;
        
        // Disable the button and show loading state
        const button = calendarEvents.querySelector(`button[data-event-id="${eventId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Adding...';
        }
        
        // Send the event to the background script to add to Calendar
        chrome.runtime.sendMessage(
            {action: "addToCalendar", event: event},
            function(response) {
                if (response && response.success) {
                    // Update the event in the UI
                    const eventElement = calendarEvents.querySelector(`div[data-event-id="${eventId}"]`);
                    if (eventElement) {
                        eventElement.classList.add('added');
                        
                        // Replace the button with a "Added to Calendar" badge
                        eventElement.innerHTML = eventElement.innerHTML.replace(
                            /<button.*<\/button>/s,
                            '<div class="event-added-badge">Added to Calendar</div>'
                        );
                    }
                    
                    // Show success message
                    addMessageToChat(`I've added "${event.title}" to your Google Calendar.`, 'bot');
                } else {
                    // Re-enable the button
                    if (button) {
                        button.disabled = false;
                        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6"></path><path d="M3 10h18"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M12 14v4"></path><path d="M10 16h4"></path></svg> Add to Calendar';
                    }
                    
                    let errorMessage = 'I couldn\'t add the event to your calendar.';
                    
                    // Handle specific error cases
                    if (response?.error) {
                        if (response.error.includes('authorization') || 
                            response.error.includes('authenticate') ||
                            response.error.includes('permission')) {
                            errorMessage = `${errorMessage} ${response.error} You may need to reload the extension.`;
                        } else {
                            errorMessage = `${errorMessage} ${response.error}`;
                        }
                    } else {
                        errorMessage = `${errorMessage} Please try again.`;
                    }
                    
                    // Show error message
                    addMessageToChat(errorMessage, 'bot');
                }
            }
        );
    }

    // Set up event listeners for email filtering
    emailFilter.addEventListener('change', fetchEmails);
    refreshButton.addEventListener('click', fetchEmails);
    
    // Set up event listener for refreshing calendar events
    refreshEvents.addEventListener('click', extractCalendarEvents);

    // Initial fetch with default filter
    fetchEmails();
});

function addMessageToChat(text, sender) {
    const chatbox = document.getElementById('chatbox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    chatbox.appendChild(messageDiv);
    
    // Scroll to bottom with smooth animation
    chatbox.scrollTo({
        top: chatbox.scrollHeight,
        behavior: 'smooth'
    });
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
  