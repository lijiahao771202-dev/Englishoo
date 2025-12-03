const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: true, // Headless for speed
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  
  try {
    // 1. Navigate to app
    console.log('Navigating to app...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle0' });
    
    // 2. Inject a card directly into IDB
    console.log('Injecting test data...');
    await page.evaluate(async () => {
      const DB_NAME = 'englishoo-db';
      const DB_VERSION = 4;
      
      const openReq = indexedDB.open(DB_NAME, DB_VERSION);
      
      return new Promise((resolve, reject) => {
        openReq.onsuccess = async () => {
          const db = openReq.result;
          
          // Ensure deck exists
          const txDeck = db.transaction('decks', 'readwrite');
          const storeDeck = txDeck.objectStore('decks');
          storeDeck.put({
            id: 'test-deck-highlight',
            name: 'Highlight Test Deck',
            createdAt: new Date(),
            theme: 'blue',
            description: 'Auto-generated for testing'
          });
          
          // Add card
          const tx = db.transaction('cards', 'readwrite');
          const store = tx.objectStore('cards');
          
          const testCard = {
            id: 'test-highlight-card',
            deckId: 'test-deck-highlight',
            word: 'HighlightTest',
            meaning: '测试高亮',
            partOfSpeech: 'noun',
            mnemonic: 'This is a **highlighted** text.',
            state: 0, 
            due: new Date(),
            createdAt: new Date(),
            lastReview: null,
            difficulty: 0,
            stability: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0
          };
          
          store.put(testCard);
          
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        openReq.onerror = () => reject(openReq.error);
      });
    });
    
    // 3. Reload to fetch data
    console.log('Reloading page...');
    await page.reload({ waitUntil: 'networkidle0' });
    
    // 4. Click the deck "Highlight Test Deck"
    console.log('Searching for deck...');
    await page.waitForSelector('div'); 
    
    // Wait a bit for React to render
    await new Promise(r => setTimeout(r, 1000));

    // Find and click deck
    const deckClicked = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('.glass-panel'));
      const targetPanel = panels.find(p => p.textContent && p.textContent.includes('Highlight Test Deck'));
      
      if (targetPanel) {
        targetPanel.click();
        return true;
      }
      return false;
    });
    
    if (!deckClicked) {
      throw new Error('Test Deck not found in UI');
    }
    console.log('Deck clicked.');
    
    // Wait for navigation to DeckDetail
    console.log('Waiting for DeckDetail to load...');
    await page.waitForSelector('input[placeholder="搜索单词..."]', { timeout: 5000 });
    
    // 5. Wait for card list and Click the card "HighlightTest" to expand
    console.log('Searching for card...');
    
    const cardExpanded = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('span'));
      // Look for the word in the list
      const cardWord = elements.find(el => el.textContent && el.textContent.trim() === 'HighlightTest');
      if (cardWord) {
        cardWord.click();
        return true;
      }
      return false;
    });
    
    if (!cardExpanded) {
      // Debug: print all spans
      const content = await page.evaluate(() => document.body.innerText);
      console.log('Page content:', content);
      throw new Error('Test Card not found in list');
    }
    console.log('Card expanded.');
    
    // 5.5 Verify highlight in List View
    await new Promise(r => setTimeout(r, 500)); // Wait for expansion animation
    console.log('Checking highlight in List View...');
    
    const listHighlight = await page.evaluate(() => {
      // In list view, we look for the expanded section
      // The structure is FormattedText -> div -> span.text-yellow-400
      const spans = Array.from(document.querySelectorAll('.text-yellow-400'));
      // Filter visible ones
      const visibleSpan = spans.find(span => {
         const rect = span.getBoundingClientRect();
         return rect.width > 0 && rect.height > 0 && span.textContent.includes('highlighted');
      });
      return !!visibleSpan;
    });
    
    if (listHighlight) {
        console.log('SUCCESS: List View Highlight verified.');
    } else {
        console.error('FAILURE: List View Highlight NOT found.');
         // Debug: Find the text and print parent
        const debugInfo = await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
            let node;
            while (node = walker.nextNode()) {
            if (node.textContent.includes('highlighted')) {
                return {
                found: true,
                parentHTML: node.parentElement.outerHTML,
                parentClasses: node.parentElement.className
                };
            }
            }
            return { found: false };
        });
        console.log('List View Debug Info:', debugInfo);
        // Do not exit yet, try modal
    }

    // 6. Click "查看卡片" button inside expanded view
    
    console.log('Clicking "View Card" button...');
    const viewButtonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const viewBtn = buttons.find(btn => btn.textContent && btn.textContent.includes('查看卡片'));
      if (viewBtn) {
        viewBtn.click();
        return true;
      }
      return false;
    });
    
    if (!viewButtonClicked) {
      throw new Error('"View Card" button not found');
    }
    
    // 7. Wait for Flashcard Modal and Reveal
    console.log('Waiting for modal...');
    await new Promise(r => setTimeout(r, 1000)); // Wait for modal
    
    // Click the flashcard to reveal
    console.log('Clicking flashcard to reveal...');
    // Wait for the flashcard header inside modal
    await page.waitForSelector('h2.text-5xl', { timeout: 5000 });
    
    // Click the header (which is inside the card)
    // Try to click the main card container
    await page.evaluate(() => {
      // The modal container
      const modal = document.querySelector('.fixed.inset-0');
      if (!modal) return;
      
      // The card container (Flashcard root)
      // It has "w-full min-h-[400px] relative cursor-pointer group"
      const card = modal.querySelector('.cursor-pointer.group');
       if (card) {
         console.log('Clicking card container...');
         card.click();
       } else {
        console.log('Card container not found, trying h2...');
        const h2 = modal.querySelector('h2');
        if (h2) h2.click();
      }
    });
    
    await new Promise(r => setTimeout(r, 2000)); // Wait for reveal animation
    
    // Check if revealed
    const isRevealed = await page.evaluate(() => {
       return document.body.innerText.includes('助记');
    });
    console.log('Is revealed:', isRevealed);
    
    // 8. Check for yellow text
    console.log('Checking for highlight...');
    const hasHighlight = await page.evaluate(() => {
      // Look for span with text-yellow-400
      const el = document.querySelector('.text-yellow-400');
      if (!el) return false;
      
      // Check content
      return el.textContent === 'highlighted';
    });
    
    if (hasHighlight) {
      console.log('SUCCESS: Found highlighted text "highlighted" in yellow!');
    } else {
      console.error('FAILURE: Did not find highlighted text.');
      
      // Debug: Find the text and print parent
      const debugInfo = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent.includes('highlighted')) {
            return {
              found: true,
              parentHTML: node.parentElement.outerHTML,
              parentClasses: node.parentElement.className
            };
          }
        }
        return { found: false };
      });
      
      console.log('Debug Info:', debugInfo);
      process.exit(1);
    }
    
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
