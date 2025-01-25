const axios = require('axios');
const cheerio = require('cheerio');

const DEALERSHIP_URL = 'https://www.johnsoncitynissan.com/searchnew.aspx';
const USED_INVENTORY_URL = 'https://www.johnsoncitynissan.com/searchused.aspx';

const searchInventory = async (query) => {
    try {
        // Determine if searching for new or used vehicles
        const isUsed = query.toLowerCase().includes('used') || query.toLowerCase().includes('pre-owned');
        const baseUrl = isUsed ? USED_INVENTORY_URL : DEALERSHIP_URL;

        // Extract vehicle model from query if present
        const models = ['altima', 'maxima', 'rogue', 'murano', 'pathfinder', 'frontier', 'titan', 'sentra', 'versa', 'kicks', 'armada'];
        const modelMatch = models.find(model => query.toLowerCase().includes(model));

        // Make the HTTP request
        const response = await axios.get(baseUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10 second timeout
        });

        const $ = cheerio.load(response.data);
        const vehicles = [];

        // Select vehicle listings
        $('.vehicle-listing').each((index, element) => {
            try {
                const title = $(element).find('.vehicle-title').text().trim();
                const price = $(element).find('.price').text().trim();
                const mileage = $(element).find('.mileage').text().trim();
                const vin = $(element).find('.vin').text().trim();
                const imageUrl = $(element).find('img').attr('src');
                const detailUrl = $(element).find('a.vehicle-link').attr('href');

                // Only add vehicles that match the model if specified
                if (!modelMatch || title.toLowerCase().includes(modelMatch)) {
                    vehicles.push({
                        title,
                        price,
                        mileage,
                        vin,
                        imageUrl,
                        detailUrl: detailUrl ? `https://www.johnsoncitynissan.com${detailUrl}` : null
                    });
                }
            } catch (err) {
                console.error('Error parsing vehicle listing:', err);
            }
        });

        // If no results found with specific selectors, try alternate selectors
        if (vehicles.length === 0) {
            $('.inventory-item').each((index, element) => {
                try {
                    const title = $(element).find('.inventory-title').text().trim();
                    const price = $(element).find('.price-value').text().trim();
                    const mileage = $(element).find('.mileage-value').text().trim();
                    const vin = $(element).find('.vin-value').text().trim();
                    const imageUrl = $(element).find('.inventory-image img').attr('src');
                    const detailUrl = $(element).find('a.inventory-link').attr('href');

                    if (!modelMatch || title.toLowerCase().includes(modelMatch)) {
                        vehicles.push({
                            title,
                            price,
                            mileage,
                            vin,
                            imageUrl,
                            detailUrl: detailUrl ? `https://www.johnsoncitynissan.com${detailUrl}` : null
                        });
                    }
                } catch (err) {
                    console.error('Error parsing inventory item:', err);
                }
            });
        }

        if (vehicles.length === 0) {
            return formatNoResultsResponse(query, isUsed);
        }

        return formatSearchResults(vehicles, isUsed);
    } catch (error) {
        console.error('Error searching inventory:', error);
        return `I apologize, but I'm having trouble accessing the inventory system right now. Please try again in a moment or contact Johnson City Nissan directly at (423) 282-2221 for the most up-to-date inventory information.`;
    }
};

const formatSearchResults = (vehicles, isUsed) => {
    const inventoryType = isUsed ? 'pre-owned' : 'new';
    let response = `Here are the ${inventoryType} vehicles I found:\n\n`;

    vehicles.forEach((vehicle, index) => {
        response += `${index + 1}. ${vehicle.title}\n`;
        if (vehicle.price) response += `   Price: ${vehicle.price}\n`;
        if (vehicle.mileage) response += `   Mileage: ${vehicle.mileage}\n`;
        if (vehicle.vin) response += `   VIN: ${vehicle.vin}\n`;
        if (vehicle.detailUrl) response += `   More details: ${vehicle.detailUrl}\n`;
        response += '\n';
    });

    response += `\nWould you like to schedule a test drive for any of these vehicles? I can help you set that up!\n`;
    response += `You can also call Johnson City Nissan at (423) 282-2221 for more information.`;

    return response;
};

const formatNoResultsResponse = (query, isUsed) => {
    const inventoryType = isUsed ? 'pre-owned' : 'new';
    let response = `I apologize, but I couldn't find any ${inventoryType} vehicles matching your search for "${query}".\n\n`;
    response += `Would you like to:\n`;
    response += `1. Search our ${isUsed ? 'new' : 'pre-owned'} inventory instead?\n`;
    response += `2. Broaden your search criteria?\n`;
    response += `3. Be notified when matching vehicles become available?\n\n`;
    response += `You can also call Johnson City Nissan at (423) 282-2221 to speak with our team about your specific requirements.`;
    return response;
};

module.exports = {
    searchInventory
};
