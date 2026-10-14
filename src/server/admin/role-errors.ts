import { FORBIDDEN_MESSAGE } from "@/server/catalog/errors";

type RpcError = { code?: string; hint?: string | null };

/** Portuguese message for a failed `gestao_cadastros_set_user_role` call. */
export function roleErrorMessage(error: RpcError): string {
  if (error.code === "42501") return FORBIDDEN_MESSAGE;
  if (error.code === "P0002") return "Usuário não encontrado.";
  if (error.code === "55000" && error.hint === "self") return "Você não pode remover o seu próprio papel de administrador.";
  if (error.code === "55000" && error.hint === "last_admin") return "É preciso manter pelo menos um administrador ativo.";
  return "Não foi possível alterar o papel. Tente novamente.";
}
