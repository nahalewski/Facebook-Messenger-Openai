const puppeteer = require('puppeteer');

const DEALERSHIP_URL = 'https://www.johnsoncitynissan.com';

async function searchInventory(query) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // Set a reasonable viewport
        await page.setViewport({ width: 1280, height: 800 });

        // Navigate to the inventory search page
        const searchUrl = `${DEALERSHIP_URL}/new-inventory/index.htm?search=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'networkidle0' });

        // Wait for the inventory items to load
        await page.waitForSelector('.vehicle-card', { timeout: 10000 }).catch(() => null);

        // Extract vehicle information
        const vehicles = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.vehicle-card');

            cards.forEach(card => {
                try {
                    const title = card.querySelector('.vehicle-card-title')?.textContent.trim() || '';
                    const price = card.querySelector('.price')?.textContent.trim() || '';
                    const mileage = card.querySelector('.mileage')?.textContent.trim() || '';
                    const vin = card.querySelector('.vin')?.textContent.trim() || '';
                    const imageUrl = card.querySelector('img')?.src || '';
                    const link = card.querySelector('a')?.href || '';

                    results.push({
                        title,
                        price,
                        mileage,
                        vin,
                        imageUrl,
                        link
                    });
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
                message: 'No vehicles found matching your criteria.',
                vehicles: []
            };
        }

        return {
            success: true,
            message: `Found ${vehicles.length} vehicles matching your search:`,
            vehicles
        };

    } catch (error) {
        console.error('Error searching inventory:', error);
        await browser.close();
        return {
            success: false,
            message: 'Unable to search inventory at this time. Please try again later or visit our website directly.',
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
        return 'I apologize, but I couldn\'t find any vehicles matching your criteria in our current inventory. Would you like to search for something else or schedule a time to visit our dealership?';
    }

    let message = `${searchResults.message}\n\n`;
    searchResults.vehicles.forEach((vehicle, index) => {
        message += `${index + 1}. ${vehicle.title}\n`;
        if (vehicle.price) message += `   Price: ${vehicle.price}\n`;
        if (vehicle.mileage) message += `   Mileage: ${vehicle.mileage}\n`;
        if (vehicle.vin) message += `   VIN: ${vehicle.vin}\n`;
        if (vehicle.link) message += `   More info: ${vehicle.link}\n`;
        message += '\n';
    });

    message += '\nWould you like more information about any of these vehicles or would you like to schedule a test drive?';
    return message;
}

module.exports = {
    searchInventory,
    formatVehicleResults
};
