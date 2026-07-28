require('dotenv').config();

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { addCustomer } = require('../src/models/customer');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function run() {
  console.log('\n======================================================');
  console.log('            ReviewForge - Add Customer CLI            ');
  console.log('======================================================\n');

  try {
    const name = (await askQuestion('Enter Customer Name: ')).trim();
    if (!name) throw new Error('Customer Name is required.');

    const email = (await askQuestion('Enter Customer Email: ')).trim();
    if (!email) throw new Error('Customer Email is required.');

    const packageName = (await askQuestion('Enter App Package Name (e.g. com.example.app): ')).trim();
    if (!packageName) throw new Error('Package Name is required.');

    const jsonPathInput = (await askQuestion('Enter path to Service Account JSON file: ')).trim();
    if (!jsonPathInput) throw new Error('Service account JSON path is required.');

    const resolvedPath = path.resolve(process.cwd(), jsonPathInput);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Service account file not found at path: ${resolvedPath}`);
    }

    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    let serviceAccountJson;
    try {
      serviceAccountJson = JSON.parse(fileContent);
    } catch (e) {
      throw new Error(`File at ${resolvedPath} is not valid JSON: ${e.message}`);
    }

    console.log('\nEncrypting credentials and saving customer to Firestore...');

    const result = await addCustomer({
      name,
      email,
      packageName,
      serviceAccountJson,
    });

    console.log('\n[SUCCESS] Customer added successfully!');
    console.log(`Firestore Document ID: ${result.id}`);
    console.log(`Name:                  ${result.name}`);
    console.log(`Email:                 ${result.email}`);
    console.log(`Package Name:          ${result.packageName}\n`);

  } catch (error) {
    console.error(`\n[ERROR] ${error.message}\n`);
  } finally {
    rl.close();
    process.exit(0);
  }
}

run();
