// Initialize the IndexedDB for caching summaries
function initSummaryDB() {
    return new Promise((resolve, reject) => {
      const dbRequest = indexedDB.open('EMADatabase', 2); // Increase version to trigger upgrade
      
      dbRequest.onupgradeneeded = function(event) {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        console.log(`Upgrading IndexedDB from version ${oldVersion} to ${db.version}`);
        
        // Create a store for email summaries if it doesn't exist
        if (!db.objectStoreNames.contains('summaries')) {
          console.log("Creating 'summaries' store");
          const summaryStore = db.createObjectStore('summaries', { keyPath: 'id' });
          summaryStore.createIndex('hash', 'hash', { unique: true });
          summaryStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Create a store for email metadata if it doesn't exist
        if (!db.objectStoreNames.contains('emails')) {
          console.log("Creating 'emails' store");
          const emailStore = db.createObjectStore('emails', { keyPath: 'id' });
          emailStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Create a store for calendar events if it doesn't exist
        if (!db.objectStoreNames.contains('events')) {
          console.log("Creating 'events' store");
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventStore.createIndex('eventDate', 'eventDate', { unique: false });
        }
      };
      
      dbRequest.onsuccess = function(event) {
        console.log("IndexedDB initialized successfully");
        resolve(event.target.result);
      };
      
      dbRequest.onerror = function(event) {
        console.error(" Error initializing IndexedDB:", event.target.error);
        reject(event.target.error);
      };
    });
}
  
// Function to store emails in IndexedDB
async function storeEmails(emails) {
    try {
      const db = await initSummaryDB();
      const transaction = db.transaction(['emails'], 'readwrite');
      const emailStore = transaction.objectStore('emails');
      
      // Timestamp for this batch
      const timestamp = Date.now();
      
      // Store each email with timestamp
      emails.forEach(email => {
        emailStore.put({
          id: email.id,
          data: email,
          timestamp: timestamp
        });
      });
      
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
          console.log(`Stored ${emails.length} emails in IndexedDB`);
          resolve();
        };
        transaction.onerror = (event) => {
          console.error(" Error storing emails:", event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error(" Error in storeEmails:", error);
    }
  }
  