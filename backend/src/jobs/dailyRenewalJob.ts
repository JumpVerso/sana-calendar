import {
    findContractsExpiringToday,
    isContractAlreadyRenewed,
    renewContractAutomatically,
} from '../services/renewalService.js';

/**
 * Job diário para renovar contratos automaticamente
 * 
 * Lógica simplificada:
 * 1. Buscar contratos onde end_date = HOJE e auto_renewal_enabled = true
 * 2. Para cada contrato, verificar se já foi renovado (há slots após end_date)
 * 3. Se não foi renovado, replicar os slots do contrato atual:
 *    - Conta slots NÃO inaugurais
 *    - Calcula próxima data baseado na frequência
 *    - Se houver conflito, busca próximo horário disponível
 *    - Atualiza end_date do contrato
 */
export async function runDailyRenewalJob(): Promise<{
    processedCount: number;
    renewedCount: number;
    skippedAlreadyRenewed: number;
    skippedNoSlots: number;
    totalSlotsCreated: number;
    errors: string[];
}> {
    console.log('[RenewalJob] ========================================');
    console.log('[RenewalJob] Iniciando verificação de renovações...');
    const startTime = Date.now();

    const result = {
        processedCount: 0,
        renewedCount: 0,
        skippedAlreadyRenewed: 0,
        skippedNoSlots: 0,
        totalSlotsCreated: 0,
        errors: [] as string[]
    };

    try {
        // 1. Buscar contratos que vencem HOJE com auto_renewal_enabled
        const contracts = await findContractsExpiringToday();
        console.log(`[RenewalJob] Encontrados ${contracts.length} contrato(s) expirando hoje com auto_renewal_enabled`);

        if (contracts.length === 0) {
            console.log('[RenewalJob] Nenhum contrato para renovar hoje.');
            return result;
        }

        // 2. Processar cada contrato
        for (const contract of contracts) {
            result.processedCount++;
            console.log(`[RenewalJob] ----------------------------------`);
            console.log(`[RenewalJob] Processando contrato ${contract.short_id} (${contract.frequency})`);

            try {
                // 2a. Verificar se já foi renovado
                const alreadyRenewed = await isContractAlreadyRenewed(contract.id, contract.end_date);
                
                if (alreadyRenewed) {
                    console.log(`[RenewalJob] ⏭️ Contrato ${contract.short_id} já foi renovado, pulando...`);
                    result.skippedAlreadyRenewed++;
                    continue;
                }

                // 2b. Renovar automaticamente
                const renewalResult = await renewContractAutomatically(contract);

                if (renewalResult.success) {
                    result.renewedCount++;
                    result.totalSlotsCreated += renewalResult.createdCount;

                    const sessionsInfo = renewalResult.sessions
                        .map(s => `${s.date} às ${s.time}${s.timeWasChanged ? ' (deslizado)' : ''}`)
                        .join(', ');

                    console.log(`[RenewalJob] ✅ Contrato ${contract.short_id} renovado com sucesso!`);
                    console.log(`[RenewalJob]    ${renewalResult.createdCount} sessão(ões) criada(s): ${sessionsInfo}`);
                    
                    if (renewalResult.skippedCount > 0) {
                        console.log(`[RenewalJob]    ⚠️ ${renewalResult.skippedCount} sessão(ões) pulada(s) por falta de disponibilidade`);
                    }
                } else {
                    result.skippedNoSlots++;
                    console.log(`[RenewalJob] ⚠️ Contrato ${contract.short_id}: nenhum slot criado`);
                }

            } catch (error: any) {
                const errorMsg = `Contrato ${contract.short_id}: ${error.message}`;
                result.errors.push(errorMsg);
                console.error(`[RenewalJob] ❌ Erro:`, errorMsg);
            }
        }

    } catch (error: any) {
        console.error('[RenewalJob] ❌ Erro fatal:', error);
        result.errors.push(`Erro fatal: ${error.message}`);
    }

    const duration = Date.now() - startTime;
    console.log('[RenewalJob] ========================================');
    console.log(`[RenewalJob] Finalizado em ${duration}ms`);
    console.log(`[RenewalJob] Resumo:`);
    console.log(`[RenewalJob]   - Processados: ${result.processedCount}`);
    console.log(`[RenewalJob]   - Renovados: ${result.renewedCount}`);
    console.log(`[RenewalJob]   - Já renovados (pulados): ${result.skippedAlreadyRenewed}`);
    console.log(`[RenewalJob]   - Sem slots (pulados): ${result.skippedNoSlots}`);
    console.log(`[RenewalJob]   - Total de slots criados: ${result.totalSlotsCreated}`);
    console.log(`[RenewalJob]   - Erros: ${result.errors.length}`);
    console.log('[RenewalJob] ========================================');

    return result;
}

/**
 * Inicia o scheduler do job (usando node-cron)
 * Deve ser chamado no startup do servidor se quiser scheduler automático
 */
export async function startRenewalScheduler(): Promise<void> {
    try {
        const cron = await import('node-cron');
        
        // Executar todo dia às 00:05 (5 min após meia-noite para garantir que é o dia certo)
        cron.default.schedule('5 0 * * *', async () => {
            console.log('[RenewalScheduler] Executando job diário de renovações...');
            await runDailyRenewalJob();
        });

        console.log('[RenewalScheduler] ✅ Scheduler iniciado - execução diária às 00:05');
    } catch (error) {
        console.warn('[RenewalScheduler] ⚠️ node-cron não disponível. Job deve ser executado manualmente via API.');
    }
}
