const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  let t = await prisma.tenant.findUnique({
    where: { name: 'Prompt Mastery' }
  });
  if (!t) {
    t = await prisma.tenant.create({
      data: { name: 'Prompt Mastery' }
    });
  }
  console.log('TENANT_ID:', t.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
