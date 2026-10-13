type DatabaseError = { code?: string; message?: string };

const uniqueViolations: Record<string, string> = {
  gestao_cadastros_services_dpto_name_key: "Já existe um serviço com esse nome neste departamento.",
  gestao_cadastros_services_one_active_correction_key: "Este departamento já tem um serviço de correção ativo.",
  gestao_cadastros_service_fields_service_key_key: "Já existe um campo com essa chave neste serviço.",
};

export const NOT_FOUND_MESSAGE = "Registro não encontrado ou sem permissão para alterá-lo.";
export const FORBIDDEN_MESSAGE = "Você não tem permissão para esta ação.";

/** Portuguese message for a PostgREST/Postgres error. Never echoes raw database text. */
export function databaseErrorMessage(error: DatabaseError): string {
  switch (error.code) {
    case "23505": {
      const match = Object.entries(uniqueViolations).find(([constraint]) => error.message?.includes(constraint));
      return match?.[1] ?? "Registro duplicado.";
    }
    case "23503":
      return "Referência inválida: o departamento ou serviço não existe.";
    case "23514":
      return "Os dados não atendem às regras do catálogo.";
    case "42501":
      return FORBIDDEN_MESSAGE;
    default:
      return "Não foi possível salvar. Tente novamente.";
  }
}
