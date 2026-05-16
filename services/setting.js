const Setting = require("../models/setting.model");

const findOne = (query) => {
  return Setting.findOne({ query });
};

const addSetting = async (payload,response) => {
  const setting = await Setting.create(payload);
  response.message = "Setting added successfully";
  response.status = 201;
  response.success = true;
  response.data = setting
  return response
};
const getAllSetting = async (response) => {
  const setting = await Setting.find();
  response.message = "Setting fetched successfully";
  response.status = 200;
  response.success = true;
  response.data = setting
  return response
};

const updateSetting = async (query,payload,response) => {
  const setting = await Setting.findOneAndUpdate(query,payload);
  response.message = "Settin updated successfully";
  response.status = 200;
  response.success = true;
  response.data=setting
  return response
};
module.exports = {
  findOne,
  addSetting,
  getAllSetting,
  updateSetting
};
