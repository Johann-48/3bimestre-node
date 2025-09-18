// Importar as bibliotecas necessárias
import express from "express";
import dotenv from "dotenv";
import prisma from "./db.js"; // Importar nossa conexão com o banco

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

// Criar aplicação Express
const app = express();

// Middleware para processar JSON nas requisições
app.use(express.json());

// Middleware para tratamento de erros
const errorHandler = (error, res) => {
  console.error("Error details:", error);

  if (error.code === "P2002") {
    return res.status(409).json({
      error: "Conflito de dados únicos",
      detail: error.meta?.target?.join(", "),
    });
  }

  if (error.code === "P2025") {
    return res.status(404).json({
      error: "Recurso não encontrado",
    });
  }

  if (error.code === "P2003") {
    return res.status(400).json({
      error: "Violação de restrição de chave estrangeira",
      detail: "O ID referenciado não existe",
    });
  }

  return res.status(500).json({
    error: "Erro interno do servidor",
    detail: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

//Healthcheck
app.get("/", (_req, res) => res.json({ ok: true, service: "API 3º Bimestre" }));

//CREATE: POST /usuarios
// CREATE: POST /users (versão com debug)
app.post("/users", async (req, res) => {
  try {
    console.log("POST /users - body:", req.body); // <-- verifique se o body chega
    const { name, email, password } = req.body;

    // validação básica
    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Campos obrigatórios ausentes (name, email, password)",
      });
    }

    // opcional: validar formato do email rápido
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Email em formato inválido" });
    }

    // cria usuário (sem hashing por enquanto)
    const novoUsuario = await prisma.user.create({
      data: { name, email, password },
    });

    res.status(201).json(novoUsuario);
  } catch (error) {
    console.error("Erro ao criar usuário (stack):", error);
    // se for erro de unique constraint do Prisma
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "E-mail já cadastrado",
        detail: error.meta || error.message,
      });
    }

    // responder o message para desenvolvimento — remova/alterar em produção
    res
      .status(500)
      .json({ error: "Erro ao criar usuário", detail: error.message });
  }
});

//READ: GET /usuarios
app.get("/users", async (_req, res) => {
  try {
    const usuarios = await prisma.user.findMany({
      orderBy: { id: "asc" },
    });
    res.json(usuarios);
  } catch (error) {
    errorHandler(error, res);
  }
});

// DELETE /users/:id - Remove um usuário e seus dados relacionados
app.delete("/users/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    // Verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Delete o usuário (a loja e produtos serão deletados em cascata devido ao onDelete: Cascade no schema)
    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(204).end(); // 204 = No Content (sucesso, sem conteúdo para retornar)
  } catch (error) {
    errorHandler(error, res);
  }
});

// ======= Rotas de Lojas =======

// POST /stores - Criar uma nova loja
// Body esperado: { name, userId }
app.post("/stores", async (req, res) => {
  try {
    const { name, userId } = req.body;

    // Validação básica
    if (!name || !userId) {
      return res.status(400).json({
        error: "Campos obrigatórios ausentes",
        detail: "name e userId são obrigatórios",
      });
    }

    // Verifica se o usuário existe
    const userExists = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!userExists) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const store = await prisma.store.create({
      data: {
        name,
        userId: Number(userId),
      },
      include: {
        user: true,
      },
    });

    res.status(201).json(store);
  } catch (error) {
    errorHandler(error, res);
  }
});
// GET /stores/:id - Retorna loja com dono e produtos
app.get("/stores/:id", async (req, res) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        products: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    res.json(store);
  } catch (error) {
    errorHandler(error, res);
  }
});

// PUT /stores/:id -> atualiza informações da loja
app.put("/stores/:id", async (req, res) => {
  try {
    const { name, userId } = req.body;
    const store = await prisma.store.update({
      where: { id: Number(req.params.id) },
      data: {
        name,
        userId: userId ? Number(userId) : undefined,
      },
    });
    res.json(store);
  } catch (e) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Loja não encontrada" });
    }
    res.status(400).json({ error: e.message });
  }
});

// DELETE /stores/:id -> remove uma loja e seus produtos
app.delete("/stores/:id", async (req, res) => {
  try {
    await prisma.store.delete({
      where: { id: Number(req.params.id) },
    });
    res.status(204).end();
  } catch (e) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Loja não encontrada" });
    }
    res.status(400).json({ error: e.message });
  }
});

// POST /products body: { name, price, storeId }
app.post("/products", async (req, res) => {
  try {
    const { name, price, storeId } = req.body;
    const product = await prisma.product.create({
      data: {
        name,
        price: Number(price),
        storeId: Number(storeId),
        updatedAt: new Date(), // Adicionando o campo updatedAt
      },
    });
    res.status(201).json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// GET /products -> inclui a loja e o dono da loja
app.get("/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { store: { include: { user: true } } },
    });
    res.json(products);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /products/:id -> atualiza informações do produto
app.put("/products/:id", async (req, res) => {
  try {
    const { name, price, storeId } = req.body;
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: {
        name,
        price: price ? Number(price) : undefined,
        storeId: storeId ? Number(storeId) : undefined,
      },
    });
    res.json(product);
  } catch (e) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Produto não encontrado" });
    }
    res.status(400).json({ error: e.message });
  }
});

// DELETE /products/:id -> remove um produto
app.delete("/products/:id", async (req, res) => {
  try {
    await prisma.product.delete({
      where: { id: Number(req.params.id) },
    });
    res.status(204).end();
  } catch (e) {
    if (e.code === "P2025") {
      return res.status(404).json({ error: "Produto não encontrado" });
    }
    res.status(400).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

//ROTA DE TESTE
app.get("/status", (req, res) => {
  res.json({ message: "API Online" });
});
