import { Client } from 'clashofclans.js';

const client = new Client();
try {
  await client.login({ email: "ak2455215@gmail.com", password: "akshaykrishna2007" });
  console.log("Keys type:", typeof client.rest.requestHandler.keys[0]);
  console.log("Keys value:", client.rest.requestHandler.keys[0]);
} catch (e) {
  console.error("Login failed:", e.message);
}
