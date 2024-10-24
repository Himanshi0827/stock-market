const axios = require('axios');
const MarketDataService = require("./fun_scrap");

const marketDataService = new MarketDataService();

module.exports.fetchMarketData = async() => {
    try {
        console.log("Fetching market data...");
        const data = await axios.get("https://api.twelvedata.com/time_series?symbol=INFY:BSE,AAPL&interval=1min&outputsize=5&apikey=demo");
        await marketDataService.insertMarketData(data.data);
    } catch (error) {
        console.log(error);
    }
};