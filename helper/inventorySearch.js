const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const DEALERSHIP_URL = 'https://www.johnsoncitynissan.com';

async function searchInventory(query) {
    let browser = null;
    
    try {
        // Configure chrome to work in serverless environment
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Navigate to the inventory search page
        const searchUrl = `${DEALERSHIP_URL}/new-inventory/index.htm?search=${encodeURIComponent(query)}`;
        
        try {
            await page.goto(searchUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });
        } catch (error) {
            console.error('Navigation error:', error);
            throw new Error('Failed to load the inventory page');
        }

        // Wait for the inventory items to load
        await page.waitForSelector('.inventory-items', { timeout: 10000 }).catch(() => null);

        // Extract vehicle information
        const vehicles = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.inventory-item');

            items.forEach(item => {
                try {
                    const title = item.querySelector('.title')?.textContent.trim() || '';
                    const price = item.querySelector('.price')?.textContent.trim() || '';
                    const mileage = item.querySelector('.mileage')?.textContent.trim() || '';
                    const vin = item.querySelector('.vin')?.textContent.trim() || '';
                    const imageUrl = item.querySelector('img')?.src || '';
                    const link = item.querySelector('a.vehicle-details')?.href || '';
                    const stockNumber = item.querySelector('.stock')?.textContent.trim() || '';

                    // Only add if we have at least a title
                    if (title) {
                        results.push({
                            title,
                            price,
                            mileage,
                            vin,
                            imageUrl,
                            link,
                            stockNumber
                        });
                    }
                } catch (error) {
                    console.error('Error extracting vehicle data:', error);
                }
            });

            return results;
        });

        await browser.close();

        if (vehicles.length === 0) {
            return {
                success: true,
                message: 'I searched our current inventory but couldn\'t find any exact matches. Would you like me to help you find similar vehicles or would you like to schedule a time to visit our dealership?',
                vehicles: []
            };
        }

        return {
            success: true,
            message: `I found ${vehicles.length} vehicles that might interest you:`,
            vehicles
        };

    } catch (error) {
        console.error('Error searching inventory:', error);
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.error('Error closing browser:', closeError);
            }
        }
        return {
            success: false,
            message: 'I\'m currently unable to access our live inventory system. However, I\'d be happy to schedule an appointment for you to visit our dealership and see our available vehicles in person. Would you like me to help you schedule a visit?',
            vehicles: []
        };
    }
}

// Function to format vehicle information into a readable message
function formatVehicleResults(searchResults) {
    if (!searchResults.success) {
        return searchResults.message;
    }

    if (searchResults.vehicles.length === 0) {
        return searchResults.message;
    }

    let message = `${searchResults.message}\n\n`;
    searchResults.vehicles.forEach((vehicle, index) => {
        message += `${index + 1}. ${vehicle.title}\n`;
        if (vehicle.price) message += `   Price: ${vehicle.price}\n`;
        if (vehicle.mileage) message += `   Mileage: ${vehicle.mileage}\n`;
        if (vehicle.stockNumber) message += `   Stock #: ${vehicle.stockNumber}\n`;
        if (vehicle.vin) message += `   VIN: ${vehicle.vin}\n`;
        if (vehicle.link) message += `   More info: ${vehicle.link}\n`;
        message += '\n';
    });

    message += '\nWould you like to:\n';
    message += '1. Schedule a test drive for any of these vehicles?\n';
    message += '2. Get more information about a specific vehicle?\n';
    message += '3. See different vehicles?\n';
    
    return message;
}

module.exports = {
    searchInventory,
    formatVehicleResults
};
