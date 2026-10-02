#!/usr/bin/env tsx
import { initDatabase, getUserByEmail, createUser, closeDatabase } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || process.env.ADMIN_EMAIL;
  const password = args[1] || process.env.ADMIN_PASSWORD;
  const name = args[2] || process.env.ADMIN_NAME || 'Administrador Principal';

  if (!email || !password) {
    console.error('Uso: npx tsx scripts/create-admin.ts <correo> <contraseña> [nombre]');
    console.error('O configure las variables de entorno ADMIN_EMAIL y ADMIN_PASSWORD.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  initDatabase();

  try {
    const existing = getUserByEmail(email);
    if (existing) {
      if (existing.role === 'admin' && existing.is_active === 1) {
        console.log(`El usuario "${email}" ya existe y es un administrador activo.`);
        process.exit(0);
      }
      console.error(`Error: Ya existe una cuenta con el correo "${email}".`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const newAdmin = createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: 'admin',
      isActive: true,
    });

    console.log('===================================================================');
    console.log(' Administrador creado exitosamente');
    console.log(` ID:      ${newAdmin.id}`);
    console.log(` Nombre:  ${newAdmin.name}`);
    console.log(` Correo:  ${newAdmin.email}`);
    console.log(` Rol:     ${newAdmin.role}`);
    console.log('===================================================================');
  } catch (err: any) {
    console.error('Error al crear el administrador:', err.message || err);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

main();
