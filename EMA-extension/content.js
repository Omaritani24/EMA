// content.js - Injects EMA logo markers next to Gmail emails and shows summaries when clicked

// Styles for the EMA marker and summary popup
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .ema-marker {
      width: 18px;
      height: 18px;
      cursor: pointer;
      margin-left: 8px;
      transition: transform 0.2s ease;
      vertical-align: middle;
      display: inline-block;
      position: relative;
      z-index: 10;
    }
    
    .ema-marker:hover {
      transform: scale(1.2);
    }
    
    .ema-summary-popup {
      position: absolute;
      z-index: 9999;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 0;
      width: 300px;
      max-width: calc(100vw - 40px);
      max-height: 400px;
      overflow: hidden;
      font-family: 'Roboto', sans-serif;
      animation: ema-fade-in 0.2s ease-out;
    }
    
    @keyframes ema-fade-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .ema-popup-header {
      background-color: #7d93ef;
      color: white;
      padding: 10px 12px;
      font-weight: 500;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
    }
    
    .ema-popup-close {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }
    
    .ema-popup-content {
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
      color: #333;
      overflow-y: auto;
      max-height: 350px;
    }
    
    .ema-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 50px;
      color: #666;
    }
    
    .ema-error {
      color: #d32f2f;
      text-align: center;
      padding: 10px;
    }
    
    .ema-popup-footer {
      padding: 8px 12px;
      background-color: #f5f5f5;
      border-top: 1px solid #eee;
      font-size: 12px;
      color: #666;
      text-align: right;
    }
  `;
  document.head.appendChild(style);
}

// Helper to get email ID from Gmail elements
function getEmailId(element) {
  try {
    // Look up the DOM tree for elements with data attributes that might contain the email ID
    let current = element;
    let depth = 0;
    const maxDepth = 10;
    
    while (current && depth < maxDepth) {
      // Check common Gmail attributes that may contain email ID
      if (current.dataset && current.dataset.messageId) {
        return current.dataset.messageId;
      }
      
      if (current.getAttribute('data-thread-id')) {
        return current.getAttribute('data-thread-id');
      }
      
      if (current.getAttribute('data-legacy-thread-id')) {
        return current.getAttribute('data-legacy-thread-id');
      }
      
      // Gmail sometimes includes ID in the href of certain elements
      const idFromHref = current.href?.match(/\/([a-f0-9]+)$/)?.[1];
      if (idFromHref && idFromHref.length > 10) {
        return idFromHref;
      }
      
      current = current.parentElement;
      depth++;
    }
    
    // Fallback: try to find the ID from row attributes
    const row = element.closest('tr[role="row"]');
    if (row) {
      const idElement = row.querySelector('[data-thread-id], [data-legacy-thread-id], [data-message-id]');
      if (idElement) {
        return idElement.getAttribute('data-thread-id') || 
               idElement.getAttribute('data-legacy-thread-id') || 
               idElement.getAttribute('data-message-id');
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting email ID:', error);
    return null;
  }
}

// Get email summary from Chrome storage
async function getEmailSummary(emailId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['emailSummaries'], (result) => {
      const summaries = result.emailSummaries || {};
      const summary = summaries[emailId];
      
      if (summary) {
        console.log(`Found summary for email ${emailId}`);
        resolve(summary.summary || null);
      } else {
        console.log(`No summary found for email ${emailId}`);
        resolve(null);
      }
    });
  });
}

// Create and show summary popup
async function showSummaryPopup(emailId, clickEvent) {
  // Remove any existing popups
  const existingPopup = document.querySelector('.ema-summary-popup');
  if (existingPopup) {
    existingPopup.remove();
  }
  
  // Create popup container
  const popup = document.createElement('div');
  popup.className = 'ema-summary-popup';
  
  // Add header with close button
  const header = document.createElement('div');
  header.className = 'ema-popup-header';
  header.innerHTML = `
    <span>EMA Email Summary</span>
    <button class="ema-popup-close">×</button>
  `;
  popup.appendChild(header);
  
  // Add content area with loading message
  const content = document.createElement('div');
  content.className = 'ema-popup-content';
  content.innerHTML = '<div class="ema-loading">Loading summary...</div>';
  popup.appendChild(content);
  
  // Add footer
  const footer = document.createElement('div');
  footer.className = 'ema-popup-footer';
  footer.textContent = 'Enhanced Mail Assistant';
  popup.appendChild(footer);
  
  // Add to page and position near click
  document.body.appendChild(popup);
  
  // Position the popup near the click, but ensure it's visible in the viewport
  const markerRect = clickEvent.target.getBoundingClientRect();
  const popupWidth = popup.offsetWidth;
  const popupHeight = popup.offsetHeight;
  
  // Calculate position to avoid viewport edges
  let left = markerRect.right + 10;
  let top = markerRect.top - 10;
  
  // Adjust if needed to keep within viewport
  if (left + popupWidth > window.innerWidth - 20) {
    left = markerRect.left - popupWidth - 10;
  }
  
  if (top + popupHeight > window.innerHeight - 20) {
    top = window.innerHeight - popupHeight - 20;
  }
  
  if (top < 20) {
    top = 20;
  }
  
  // Apply position
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  
  // Add close button functionality
  popup.querySelector('.ema-popup-close').addEventListener('click', () => {
    popup.remove();
  });
  
  // Close when clicking outside
  document.addEventListener('click', function closePopup(e) {
    if (!popup.contains(e.target) && !e.target.closest('.ema-marker')) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  });
  
  // Fetch and display summary
  try {
    const summary = await getEmailSummary(emailId);
    
    if (summary) {
      content.innerHTML = `<div>${summary}</div>`;
    } else {
      // No summary found, show message with option to generate
      content.innerHTML = `
        <div class="ema-error">
          No summary available for this email.
          <div style="margin-top: 10px;">
            <button id="ema-generate-summary" style="padding: 5px 10px; background: #7d93ef; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Generate Summary
            </button>
          </div>
        </div>
      `;
      
      // Add event listener to generate summary button
      setTimeout(() => {
        const generateBtn = document.getElementById('ema-generate-summary');
        if (generateBtn) {
          generateBtn.addEventListener('click', () => {
            content.innerHTML = '<div class="ema-loading">Generating summary...</div>';
            
            // Send message to background script to generate summary
            chrome.runtime.sendMessage({
              action: 'generateSummaryForEmail',
              emailId: emailId
            }, (response) => {
              if (response && response.success && response.summary) {
                content.innerHTML = `<div>${response.summary}</div>`;
              } else {
                content.innerHTML = `
                  <div class="ema-error">
                    Couldn't generate summary. Please try opening this email in EMA.
                  </div>
                `;
              }
            });
          });
        }
      }, 0);
    }
  } catch (error) {
    console.error('Error fetching summary:', error);
    content.innerHTML = `
      <div class="ema-error">
        Error loading summary. Please try again.
      </div>
    `;
  }
}

// Create and add marker to an email element
function addMarkerToEmail(emailElement) {
  try {
    // Skip if already processed
    if (emailElement.querySelector('.ema-marker')) return;
    
    // Find a good insertion point
    const subjectElement = 
      emailElement.querySelector('.bog') ||  // Most common for list view
      emailElement.querySelector('.y6') ||   // Alternative for list view
      emailElement.querySelector('.bqe') ||  // Subject in conversation view
      emailElement.querySelector('[data-thread-id]') || // General fallback
      emailElement.querySelector('h2');      // Last resort
      
    if (!subjectElement) return;
    
    // Create the marker image
    const marker = document.createElement('img');
    marker.src = chrome.runtime.getURL('logo.png');
    marker.className = 'ema-marker';
    marker.title = 'View EMA summary';
    
    // Add data attribute to track if we've processed this element
    emailElement.dataset.emaProcessed = 'true';
    
    // Add click event handler
    marker.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent Gmail from opening the email
      e.preventDefault();
      
      const emailId = getEmailId(emailElement);
      if (emailId) {
        showSummaryPopup(emailId, e);
      } else {
        console.error('Could not determine email ID');
      }
    });
    
    // Add marker after the subject
    subjectElement.appendChild(marker);
  } catch (error) {
    console.error('Error adding marker:', error);
  }
}

// Process all visible emails to add markers
function processEmails() {
  // Find email elements in list view (inbox, folders, etc.)
  const listEmailRows = document.querySelectorAll('tr[role="row"]');
  listEmailRows.forEach(row => {
    if (!row.dataset.emaProcessed) {
      addMarkerToEmail(row);
    }
  });
  
  // Find email elements in conversation view (when reading an email)
  const conversationEmails = document.querySelectorAll('.adn, .h7');
  conversationEmails.forEach(email => {
    if (!email.dataset.emaProcessed) {
      addMarkerToEmail(email);
    }
  });
}

// Initialize the content script
function initialize() {
  console.log('EMA: Initializing content script');
  
  // Make the logo.png available for content script use
  chrome.runtime.getURL('logo.png');
  
  // Inject our styles
  injectStyles();
  
  // Process existing emails
  processEmails();
  
  // Set up observer for new emails
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        shouldProcess = true;
        break;
      }
    }
    
    if (shouldProcess) {
      // Delay processing slightly to ensure DOM is ready
      setTimeout(processEmails, 100);
    }
  });
  
  // Start observing the main content area
  const mainContent = document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });
  
  // Re-process periodically to catch any missed emails (Gmail's dynamic loading)
  setInterval(processEmails, 3000);
}

// Start the script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refreshMarkers') {
    // Clear all processed flags and re-process
    document.querySelectorAll('[data-ema-processed]').forEach(el => {
      delete el.dataset.emaProcessed;
    });
    
    // Remove existing markers
    document.querySelectorAll('.ema-marker').forEach(marker => {
      marker.remove();
    });
    
    // Re-process emails
    processEmails();
    
    sendResponse({ success: true });
  }
}); 