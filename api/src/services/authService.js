import bcrypt from "bcrypt";
import User from "../models/User.js";

const BCRYPT_COST = 12;
// Hash de uma senha que ninguém usa: o LOGIN de um email inexistente gasta o
// mesmo tempo que o de um email real, então tempo e resposta não revelam quais
// emails têm conta. O CADASTRO ainda avisa que o email já existe (409): é uma
// troca consciente por usabilidade, que a Fase 2 protege com limite de tentativas.
const DUMMY_HASH = await bcrypt.hash("senha-que-nao-existe", BCRYPT_COST);

export class AuthError extends Error {
  constructor(message, status, publicCode) {
    super(message);
    this.status = status;
    this.expose = true;
    this.publicCode = publicCode;
  }
}

// Conta de senha criada COM a confirmação de email ligada e nunca confirmada: ninguém entrou nela
// (o login exige a confirmação), então não tem dado nenhum e quem diz ser o dono do email pode
// assumi-la. Sem isso, alguém poderia "reservar" o email dos outros. Contas antigas (de antes da
// confirmação existir) não têm o link pendente e nunca entram nessa regra.
const SQUATTED = { provider: "password", emailVerified: { $ne: true }, emailVerifyHash: { $exists: true } };

// `takeoverUnverified`: a confirmação de email está ligada, então um cadastro novo pode assumir uma
// conta reservada e nunca confirmada (o link novo é emitido pelo chamador).
export async function signup({ name, email, password }, { takeoverUnverified = false } = {}) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const user = await User.create({ name, email, passwordHash });
    return user;
  } catch (err) {
    // Índice único do email (cobre também duas requisições ao mesmo tempo)
    if (err?.code !== 11000) throw err;
    if (takeoverUnverified) {
      const taken = await User.findOneAndUpdate({ email, ...SQUATTED }, { $set: { name, passwordHash } }, { returnDocument: "after" });
      if (taken) return taken;
    }
    throw new AuthError("Este email já está cadastrado", 409);
  }
}

export async function signin({ email, password }) {
  // Conta criada pelo Google não tem senha: cai no mesmo erro genérico (e gasta o
  // mesmo tempo) de qualquer outro login errado.
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AuthError("Email ou senha incorretos", 401);
  return user;
}

// Entrada pelo Google. Contas só se juntam pelo identificador do Google (sub).
// Se o email já tem conta de senha NÃO juntamos sozinhos: o email do cadastro com
// senha nunca foi verificado, então alguém poderia ter criado essa conta antes
// com o email da vítima e ficaria dono dela depois do login com o Google.
export async function googleSignin({ googleId, email, name }, { releaseUnverified = false } = {}) {
  const byGoogle = await User.findOne({ googleId });
  if (byGoogle) return byGoogle;

  // O Google confirmou este email: uma conta de senha reservada e nunca confirmada (sem dados) cede o lugar.
  if (releaseUnverified) await User.deleteOne({ email, ...SQUATTED });

  if (await User.exists({ email })) {
    throw new AuthError("Já existe uma conta com este email. Entre com o email e a senha.", 409);
  }

  try {
    return await User.create({
      name: (name || email.split("@")[0]).slice(0, 80),
      email,
      googleId,
      provider: "google",
      emailVerified: true,
      profileComplete: false,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Corrida: a conta apareceu entre a checagem e a criação.
      const again = await User.findOne({ googleId });
      if (again) return again;
      throw new AuthError("Já existe uma conta com este email. Entre com o email e a senha.", 409);
    }
    throw err;
  }
}

export async function completeProfile(user, { name }) {
  user.name = name;
  user.profileComplete = true;
  await user.save();
  return user;
}
