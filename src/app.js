require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initializeDatabase = require("./services/mongo_client");
// const { fetchMarketData } = require("./functions/fun_scrap");
const app = express();

initializeDatabase().then(() => {
    //fetchMarketData();
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Error Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
});

app.get("/", (req, res) => {
    res.send("Hello World!");
});


app.use("/market", require("./api/market/routes"));

module.exports = app


