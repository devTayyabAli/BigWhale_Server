const moment = require("moment-timezone");

const momentTimezone = (date) => {
  return moment(date && date).tz("GMT").tz(process.env.DEFAULT_TIMEZONE);
};

const momentToAdd = (time, unit, date) => {
  return momentTimezone(date && date).add(time, unit).format("YYYY-MM-DDTHH:mm:ss.SSS[+00:00]");
};

const momentToSubtract = (time, duration) => {
  return momentTimezone().subtract(time, duration).format("YYYY-MM-DDTHH:mm:ss.SSS[+00:00]");
};

const momentFormated = (date) => {
  return momentTimezone(date && date).format("YYYY-MM-DDTHH:mm:ss.SSS[+00:00]");
};

const momentFormatedWithSetTime = (date,time) => {
  return momentTimezone(date && date).set(time).format("YYYY-MM-DDTHH:mm:ss.SSS[+00:00]");
};


const momentToAddWithoutTimezone = (time, unit, date) => {
  return moment(date && date).add(time, unit).format("YYYY-MM-DDTHH:mm:ss.SSS[+00:00]");
};

const momentDiffWithoutTimezone = (from, to, unit) => {
  return moment(from).diff(to, unit);
};

module.exports = {
  momentTimezone,
  momentToAdd,
  momentFormated,
  momentToSubtract,
  momentToAddWithoutTimezone,
  momentDiffWithoutTimezone,
  momentFormatedWithSetTime
};
