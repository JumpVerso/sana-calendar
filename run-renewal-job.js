/**
 * Script para executar o job de renovação automática no console do navegador
 * 
 * Uso:
 * 1. Abra o console do navegador (F12)
 * 2. Cole e execute este script
 * 3. O resultado será exibido no console
 */

(async function runRenewalJob() {
    console.log('🔄 Iniciando execução do job de renovação automática...\n');
    
    // Detectar URL base da API
    const API_BASE_URL = window.location.origin.includes('localhost') 
        ? 'http://localhost:3001/api'
        : `${window.location.origin}/api`;
    
    const endpoint = `${API_BASE_URL}/renewals/process`;
    
    console.log(`📍 Endpoint: ${endpoint}`);
    console.log(`⏰ Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);
    
    try {
        const startTime = Date.now();
        
        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include', // Inclui cookies de autenticação
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        console.log('✅ Job executado com sucesso!\n');
        console.log('📊 Resultado:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   Processados: ${result.processedCount || 0}`);
        console.log(`   Renovados: ${result.renewedCount || 0}`);
        console.log(`   Já renovados (pulados): ${result.skippedAlreadyRenewed || 0}`);
        console.log(`   Sem slots (pulados): ${result.skippedNoSlots || 0}`);
        console.log(`   Total de slots criados: ${result.totalSlotsCreated || 0}`);
        console.log(`   Erros: ${result.errors?.length || 0}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`⏱️  Tempo de execução: ${duration}ms\n`);
        
        if (result.errors && result.errors.length > 0) {
            console.warn('⚠️  Erros encontrados:');
            result.errors.forEach((error, index) => {
                console.warn(`   ${index + 1}. ${error}`);
            });
            console.log('');
        }
        
        if (result.renewedCount > 0) {
            console.log('🎉 Renovações realizadas com sucesso!');
        } else if (result.processedCount === 0) {
            console.log('ℹ️  Nenhum contrato encontrado para renovar hoje.');
        } else {
            console.log('ℹ️  Nenhuma renovação foi necessária.');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro ao executar job de renovação:');
        console.error(error);
        
        if (error.message.includes('401')) {
            console.error('\n💡 Dica: Você precisa estar autenticado. Faça login na aplicação primeiro.');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.error('\n💡 Dica: Verifique se o backend está rodando e acessível.');
        }
        
        throw error;
    }
})();
