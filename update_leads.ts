import mongoose from 'mongoose';
import Lead from './src/models/Lead';

mongoose.connect('mongodb://127.0.0.1:27017/educrm')
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
