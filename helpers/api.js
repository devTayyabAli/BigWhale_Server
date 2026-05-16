const axios = require("axios");

const baseURL = process.env.KYC_BASE_URL;

const api = axios.create({
  baseURL,
});

module.exports={
    api
}
