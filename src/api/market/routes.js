const express = require("express");
const router = express.Router();
const marketController = require("./controllers");

router.get("/latest-price", marketController.getLatestPrice);

router.get("/automate-scrap/:ops", marketController.automateScrap);

module.exports = router;