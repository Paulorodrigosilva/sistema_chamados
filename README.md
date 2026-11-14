# sistema_chamados

## CasaForma Pro — planejador de plantas

Este repositório contém um protótipo completo de planejador de plantas residenciais, com:
- editor 2D e 3D
- criação de cômodos, muros, portas, janelas, portões
- catálogo de itens domésticos e externos
- fusão de cômodos
- múltiplos andares
- login simples para uso local e servidor
- exportação em JSON e PDF
- salvamento automático local e compatível com backend

### Acesso
A aplicação é servida em:
- `/plantas/`

### Deploy na Vercel
O app já está pensado para funcionar em hospedagem estática com o backend Express do repo. Faça o push para a branch conectada ao seu projeto Vercel e o deploy será executado automaticamente.

### Observações
- Se o `DATABASE_URL` estiver configurado, o login e o salvamento podemPersistir no servidor.
- Se o banco não estiver configurado, o projeto continua funcionando com salvamento local no navegador.
- Para exportar em PDF, use o botão "PDF" na interface ou imprima a tela no navegador.
