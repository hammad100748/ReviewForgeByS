require('dotenv').config();

const readline = require('readline');
const { getAllActiveCustomers, setAutoPostMode } = require('../src/models/customer');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`         ReviewForge - Toggle Auto-Post Mode          `);
  console.log(`======================================================\n`);

  try {
    const customers = await getAllActiveCustomers();

    if (!customers || customers.length === 0) {
      console.log(`[INFO] No active customers found in Firestore.\n`);
      return;
    }

    console.log(`Active Customers:\n`);
    customers.forEach((customer, index) => {
      const statusLabel = customer.autoPostEnabled ? 'ENABLED (Auto-Post Active)' : 'DISABLED (Manual Approval)';
      console.log(`[${index + 1}] ID: ${customer.id}`);
      console.log(`    Name:             ${customer.name}`);
      console.log(`    Email:            ${customer.email}`);
      console.log(`    Package:          ${customer.packageName}`);
      console.log(`    Auto-Post Status: ${statusLabel}\n`);
    });

    const selectionInput = await askQuestion(`Select customer number (1-${customers.length}) or enter 0 to exit: `);
    const selectedIndex = parseInt(selectionInput.trim(), 10) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0) {
      console.log('\nExiting without making changes.\n');
      return;
    }

    if (selectedIndex >= customers.length) {
      console.log('\n[ERROR] Invalid customer selection number.\n');
      return;
    }

    const selectedCustomer = customers[selectedIndex];

    console.log(`\nSelected Customer: ${selectedCustomer.name} (${selectedCustomer.packageName})`);
    console.log(`Current Auto-Post Status: ${selectedCustomer.autoPostEnabled ? 'ENABLED' : 'DISABLED'}`);

    const toggleInput = await askQuestion('Enable Auto-Post mode for this customer? (y/n / on/off): ');
    const normalized = toggleInput.trim().toLowerCase();

    let enableAutoPost = false;
    if (normalized === 'y' || normalized === 'yes' || normalized === 'on' || normalized === 'enable' || normalized === 'true') {
      enableAutoPost = true;
    } else if (normalized === 'n' || normalized === 'no' || normalized === 'off' || normalized === 'disable' || normalized === 'false') {
      enableAutoPost = false;
    } else {
      console.log('\n[ERROR] Invalid input. Expected y/n or on/off. Aborting.\n');
      return;
    }

    console.log(`\nUpdating auto-post status in Firestore...`);
    await setAutoPostMode(selectedCustomer.id, enableAutoPost);

    const newStatusLabel = enableAutoPost ? 'ENABLED' : 'DISABLED';
    console.log(`\n[SUCCESS] Auto-Post mode is now ${newStatusLabel} for customer '${selectedCustomer.name}'.\n`);

  } catch (error) {
    console.error(`\n[ERROR] ${error.message}\n`);
  } finally {
    rl.close();
    process.exit(0);
  }
}

run();
