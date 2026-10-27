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
    // false até a pessoa confirmar o nome na tela "Complete seu perfil".
    profileComplete: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model("User", userSchema);
