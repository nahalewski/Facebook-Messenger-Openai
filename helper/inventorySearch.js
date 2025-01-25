const axios = require('axios');
const cheerio = require('cheerio');

const DEALERSHIP_URL = 'https://www.johnsoncitynissan.com';

async function searchInventory(query) {
    try {
        // Configure axios with proper headers
        const axiosConfig = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000
        };

        // Make the request to the inventory page
        const searchUrl = `${DEALERSHIP_URL}/new-inventory/index.htm?search=${encodeURIComponent(query)}`;
        const response = await axios.get(searchUrl, axiosConfig);

        if (response.status !== 200) {
            throw new Error(`Failed to fetch inventory. Status: ${response.status}`);
        }

        // Load the HTML into cheerio
        const $ = cheerio.load(response.data);
        const vehicles = [];

        // Find all vehicle items
        $('.inventory-item').each((index, element) => {
            try {
                const $item = $(element);
                const title = $item.find('.title').text().trim();
                const price = $item.find('.price').text().trim();
                const mileage = $item.find('.mileage').text().trim();
                const vin = $item.find('.vin').text().trim();
                const imageUrl = $item.find('img').attr('src');
                const link = $item.find('a.vehicle-details').attr('href');
                const stockNumber = $item.find('.stock').text().trim();

                // Only add if we have at least a title
                if (title) {
                    vehicles.push({
                        title,
                        price,
                        mileage,
                        vin,
                        imageUrl,
                        link: link ? `${DEALERSHIP_URL}${link}` : '',
                        stockNumber
                    });
                }
            } catch (error) {
                console.error('Error extracting vehicle data:', error);
            }
        });

        // If no vehicles found, try searching used inventory
        if (vehicles.length === 0 && !query.toLowerCase().includes('used')) {
            const usedSearchUrl = `${DEALERSHIP_URL}/used-inventory/index.htm?search=${encodeURIComponent(query)}`;
            const usedResponse = await axios.get(usedSearchUrl, axiosConfig);
            
            if (usedResponse.status === 200) {
                const $used = cheerio.load(usedResponse.data);
                
                $used('.inventory-item').each((index, element) => {
                    try {
                        const $item = $(element);
                        const title = $item.find('.title').text().trim();
                        const price = $item.find('.price').text().trim();
                        const mileage = $item.find('.mileage').text().trim();
                        const vin = $item.find('.vin').text().trim();
                        const imageUrl = $item.find('img').attr('src');
                        const link = $item.find('a.vehicle-details').attr('href');
                        const stockNumber = $item.find('.stock').text().trim();

                        if (title) {
                            vehicles.push({
                                title,
                                price,
                                mileage,
                                vin,
                                imageUrl,
                                link: link ? `${DEALERSHIP_URL}${link}` : '',
                                stockNumber
                            });
                        }
                    } catch (error) {
                        console.error('Error extracting used vehicle data:', error);
                    }
                });
            }
        }

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
        return {
            success: false,
            message: 'I\'m currently unable to access our live inventory system. However, I\'d be happy to schedule an appointment for you to visit our dealership and see our available vehicles in person. Would you like me to help you schedule a visit?',
            vehicles: []
        };
    }
}

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
