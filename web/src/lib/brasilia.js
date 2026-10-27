import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// Datas e horas dos lançamentos aparecem no horário de Brasília (UTC-3), o mesmo
// em que a API separa os meses. Sem isso, um aparelho em outro fuso mostraria, na
// lista de outubro, um lançamento com data de 1º de novembro.
export const inBrasilia = (date) => dayjs(date).utcOffset(-180);
