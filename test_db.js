const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://snsanjay2002:Sanjay14@cluster0.otlc0.mongodb.net/edu-crm?retryWrites=true&w=majority&appName=Cluster0');
  const User = mongoose.connection.collection('users');
  const user = await User.findOne({ email: 'kumar@gmail.com' });
  console.log('Kumar user:', user);

  const Lead = mongoose.connection.collection('leads');
  const leads = await Lead.find({ name: 'Sanjay S N' }).toArray();
  console.log('Sanjay leads:', leads.map(l => ({ name: l.name, tenantId: l.tenantId })));
  
  process.exit(0);
}
test().catch(console.error);
