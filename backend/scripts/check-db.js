const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const requiredColumns = [
    ['Room', 'houseNumber'],
    ['Tenant', 'customerCode'],
    ['Owner', 'customerCode'],
  ];
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
    ORDER BY table_name, column_name
  `;
  const indexes = await prisma.$queryRaw`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
    ORDER BY indexname
  `;
  const columnSet = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  const indexSet = new Set(indexes.map((index) => index.indexname));

  console.log('Database schema check');
  for (const [table, column] of requiredColumns) {
    const key = `${table}.${column}`;
    console.log(`${columnSet.has(key) ? 'OK ' : 'MISS'} ${key}`);
  }

  for (const indexName of [
    'Room_houseNumber_key',
    'Tenant_customerCode_key',
    'Owner_customerCode_key',
    'Tenant_phone_key',
    'Owner_phone_key',
    'Tenant_email_key',
    'Owner_email_key',
  ]) {
    console.log(`${indexSet.has(indexName) ? 'OK ' : 'MISS'} ${indexName}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
