import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { dbReady } from '../src/lib/db';
import { hashAdminPassword } from '../src/lib/admin-auth';
import { userRepository } from '../src/lib/db/repositories/user.repository';

async function main() {
  const rl = createInterface({ input, output });
  const email = (process.env.ADMIN_EMAIL || await rl.question('Admin email: ')).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  await dbReady;
  if (!email || password.length < 12) throw new Error('ADMIN_PASSWORD with at least 12 characters is required');
  if (await userRepository.findAdminByEmail(email)) throw new Error('Admin already exists');
  const user = await userRepository.createAdmin(email, await hashAdminPassword(password));
  console.log(`Created admin ${user?.id} (${email})`);
  await rl.close();
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
