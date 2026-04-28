/**
 * seedAll.js — Master seed script
 * Runs in order: syncDB → seedUsers → seedData
 */
const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  { file: 'syncDB.js',    label: 'Syncing database tables' },
  { file: 'seedUsers.js',  label: 'Seeding demo users' },
  { file: 'seedData.js',   label: 'Seeding demo data' },
];

console.log('╔═══════════════════════════════════════════╗');
console.log('║     HEXA SALON — Full Database Seeder     ║');
console.log('╚═══════════════════════════════════════════╝\n');

for (const { file, label } of scripts) {
  console.log(`── ${label} ──────────────────────────────`);
  try {
    execSync(`node "${path.join(__dirname, file)}"`, { stdio: 'inherit' });
    console.log('');
  } catch (err) {
    console.error(`\n✗ Failed at ${file}. Aborting.\n`);
    process.exit(1);
  }
}

console.log('══════════════════════════════════════════════');
console.log('✓ All seed scripts completed successfully!');
console.log('══════════════════════════════════════════════');
