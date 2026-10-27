import bcrypt from "bcrypt";
import User from "../models/User.js";

const BCRYPT_COST = 12;
// Hash de uma senha que ninguém usa: o LOGIN de um email inexistente gasta o
// mesmo tempo que o de um email real, então tempo e resposta não revelam quais
// emails têm conta. O CADASTRO ainda avisa que o email já existe (409): é uma
// troca consciente por usabilidade, que a Fase 2 protege com limite de tentativas.
const DUMMY_HASH = await bcrypt.hash("senha-que-nao-existe", BCRYPT_COST);

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export async function signup({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const user = await User.create({ name, email, passwordHash });
    return user;
  } catch (err) {
    // Índice único do email (cobre também duas requisições ao mesmo tempo)
    if (err?.code === 11000) throw new AuthError("Este email já está cadastrado", 409);
    throw err;
  }
}

export async function signin({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AuthError("Email ou senha incorretos", 401);
  return user;
}
