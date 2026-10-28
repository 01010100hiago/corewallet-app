import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Quem entra só com o Google não tem senha.
    passwordHash: {
      type: String,
      select: false,
      required: function requiresPassword() {
        return !this.googleId;
      },
    },
    // "sub" do Google: identificador estável da conta (o email pode mudar).
    googleId: { type: String, unique: true, sparse: true, select: false },
    // Como a conta foi criada. Hoje cada conta tem um só método de entrada.
    provider: { type: String, enum: ["password", "google"], default: "password" },
    // O email veio verificado pelo Google. Cadastro com senha não verifica o email.
    emailVerified: { type: Boolean, default: false },
    // Quantas categorias próprias a pessoa tem por tipo. Serve de reserva atômica para o limite
    // (ver categoryService): contar e criar em dois passos deixaria o limite furar em disputa.
    categoryCount: {
      input: { type: Number, default: 0 },
      output: { type: Number, default: 0 },
    },
    // Verificação em duas etapas (TOTP). O segredo fica cifrado (lib/secretBox) e nunca sai da API.
    // totpPendingSecret é o segredo de uma ativação que ainda não foi confirmada com um código.
    totpEnabled: { type: Boolean, default: false },
    totpEnabledAt: { type: Date },
    totpSecret: { type: String, select: false },
    totpPendingSecret: { type: String, select: false },
    // Último passo de 30 s aceito: o mesmo código não vale duas vezes.
    totpLastStep: { type: Number, select: false },
    // Erros seguidos no segundo fator, por conta (vale para qualquer IP): ao passar do limite, trava um tempo.
    totpFails: { type: Number, select: false },
    totpLockedUntil: { type: Date, select: false },
    // Só os hashes (SHA-256) dos códigos de recuperação; cada um vale uma vez.
    recoveryCodes: { type: [String], select: false, default: undefined },
    // Confirmação do email: só o hash do link fica no banco.
    // Conta de senha criada com a confirmação ligada e ainda não confirmada: só ela pode ser assumida por
    // um novo cadastro do mesmo email. Contas antigas nunca têm este marcador.
    pendingSignup: { type: Boolean, select: false },
    emailVerifyHash: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    emailVerifySentAt: { type: Date, select: false },
    // Senhas erradas digitadas neste link: ao passar do limite o link é queimado.
    emailVerifyFails: { type: Number, select: false },
    // false até a pessoa confirmar o nome na tela "Complete seu perfil".
    profileComplete: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model("User", userSchema);
