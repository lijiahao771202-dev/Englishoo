
const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('dialog', async dialog => {
      console.log('PAGE DIALOG:', dialog.message());
      await dialog.dismiss();
  });
  
  // Set viewport to desktop size
  await page.setViewport({ width: 1280, height: 800 });

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // 1. Check Home Page (Decks)
    console.log('Checking Home Page...');
    await page.waitForSelector('h1', { timeout: 5000 });
    const title = await page.$eval('h1', el => el.textContent);
    console.log('Page Title:', title);
    
    // 2. Find a deck to click (First one)
    console.log('Finding a deck...');
    // Wait for deck items
    await page.waitForSelector('.group.relative', { timeout: 5000 });
    const deckCards = await page.$$('.group.relative');
    if (deckCards.length > 0) {
        console.log(`Found ${deckCards.length} decks. Clicking the first one...`);
        await deckCards[0].click();
        
        await new Promise(r => setTimeout(r, 2000)); // Wait for transition

        // 3. Check Deck Detail Page
        console.log('Waiting for Deck Detail...');
        await page.waitForSelector('button', { timeout: 5000 });
        
        // Find "查看分组" button
        const clusterBtnHandle = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.textContent.includes('查看分组'));
        });
        
        const clusterBtn = clusterBtnHandle.asElement();

        if (clusterBtn) {
            console.log('Found Cluster button. Clicking (Run 1)...');
            await clusterBtn.click();
            
            // Wait for loading
            console.log('Waiting for Cluster View...');
            await page.waitForSelector('.text-blue-500', { timeout: 30000 }); // Loader text?
            
            // Wait for graph or grid
            try {
                await page.waitForSelector('.grid.grid-cols-1', { timeout: 60000 });
                console.log('SUCCESS: Cluster Grid loaded (Run 1).');
            } catch (e) {
                console.log('Wait for grid failed, maybe still loading?');
            }

            // Go back
            console.log('Going back...');
            // Find back button (ArrowLeft)
            const backBtn = await page.evaluateHandle(() => {
                 const buttons = Array.from(document.querySelectorAll('button'));
                 // Usually the first button or one with specific icon
                 return buttons[0]; 
            });
            if (backBtn.asElement()) {
                await backBtn.asElement().click();
                console.log('Clicked Back. Waiting for Deck Detail...');
                // Wait for the "View Clusters" button to reappear
                try {
                    await page.waitForFunction(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.some(b => b.textContent.includes('查看分组'));
                    }, { timeout: 10000 });
                    console.log('Deck Detail loaded.');
                } catch (e) {
                    console.error('Timeout waiting for Deck Detail buttons');
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            // Click again (Run 2)
            console.log('Clicking Cluster button again (Run 2)...');
            // Re-find button as DOM changed
             const clusterBtnHandle2 = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => b.textContent.includes('查看分组'));
            });
            if (clusterBtnHandle2.asElement()) {
                console.log('Found Cluster button for Run 2. Clicking...');
                await clusterBtnHandle2.asElement().click();
                await page.waitForSelector('.grid.grid-cols-1', { timeout: 60000 });
                console.log('SUCCESS: Cluster Grid loaded (Run 2).');
            } else {
                console.error('ERROR: Could not find Cluster button for Run 2');
            }

        } else {
            console.warn('WARNING: "Check Clusters" button not found.');
        }

    } else {
        console.error('No decks found.');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
