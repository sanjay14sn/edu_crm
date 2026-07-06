const mongoose = require('mongoose');
const Lead = require('./src/models/Lead').default;

mongoose.connect('mongodb+srv://snsanjay2002:Sanjay14@cluster0.otlc0.mongodb.net/edu-crm?retryWrites=true&w=majority&appName=Cluster0')
  .then(async () => {
    const result = await Lead.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: 'ERP' } }
    );
    console.log(`Updated ${result.modifiedCount} leads`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
