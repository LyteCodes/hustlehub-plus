const mongoose = require("mongoose");

// Wrap client-supplied {$operator: …} object in $eq to match as data, never run as a query operator
mongoose.set("sanitizeFilter", true);

const connectToDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("[+] Connection to MongoDB cluster was successful!");
  } catch (ex) {
    console.log("[!] MongoDB cluster connection failed: ", ex);
    process.exit(1);
  }
};

module.exports = connectToDB;
