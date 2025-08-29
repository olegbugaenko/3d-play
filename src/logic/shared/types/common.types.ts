import { ResourceRequest } from '@resources/resource-types';


// Формула вартості будівлі/апгрейду
export type CostFormula = (level: number) => ResourceRequest;

