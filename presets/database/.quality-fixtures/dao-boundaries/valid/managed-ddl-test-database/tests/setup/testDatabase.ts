await client.query(`CREATE DATABASE ${name}`);
await client.query('DROP DATABASE IF EXISTS other');
